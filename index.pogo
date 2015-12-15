crypto = require 'crypto'
_ = require 'underscore'
mssqlDriver = require './mssqlDriver'
pgDriver = require './pgDriver'
mysqlDriver = require './mysqlDriver'
oracleDriver = require './oracleDriver'

debugQuery = (require 'debug')('sworm')
debugResults = (require 'debug')('sworm:results')

rowBase =
  fieldsForObject(obj) = [
    key <- Object.keys(obj)
    value = obj.(key)
    (value :: Date) @or (value != null @and value != nil @and @not (value :: Object))
    key
  ]

  foreignFieldsForObject(obj) = [
    key <- Object.keys(obj)
    @not r/^_/.test(key) @and key != obj._meta.id
    value = obj.(key)
    @not (value :: Date) @and (value :: Object)
    key
  ]

  insert(obj) =
    keys = fieldsForObject(obj)
    fields = keys.join ', '
    values = [
      key <- keys
      '@' + key
    ].join ', '

    outputId =
      if (obj._meta.id :: String)
        {
          beforeValues() = obj._meta.db.driver.outputIdBeforeValues(obj._meta.id)
          afterValues() = obj._meta.db.driver.outputIdAfterValues(obj._meta.id)
        }
      else
        {
          beforeValues() = ''
          afterValues() = ''
        }

    statementString = "insert into #(obj._meta.table)
                         (#(fields))
                         #(outputId.beforeValues())
                         values (#(values))
                         #(outputId.afterValues())"

    params = _.pick(obj, keys)

    if (obj._meta.db.driver.outputIdKeys @and @not obj._meta.compoundKey)
      params := _.extend(params, obj._meta.db.driver.outputIdKeys(obj._meta.idType))

    r = obj._meta.db.query (statementString, params, statement = true)!

    obj.setSaved()

    if (@not obj._meta.compoundKey)
      insertedId = obj._meta.db.driver.insertedId(r, obj._meta.id)
      obj.(obj._meta.id) = insertedId

    obj.setNotChanged()

  update(obj) =
    keys = [
      key <- fieldsForObject(obj)
      key != obj._meta.id
      key
    ]
    assignments = [
      key <- keys
      "#(key) = @#(key)"
    ].join ', '

    whereClause =
      if (obj._meta.compoundKey)
        keys.push(obj._meta.id, ...)
        [key <- obj._meta.id, "#(key) = @#(key)"].join ' and '
      else
        if (obj.identity() == nil)
          @throw @new Error "entity must have #(obj._meta.id) to be updated"

        keys.push(obj._meta.id)
        "#(obj._meta.id) = @#(obj._meta.id)"

    statementString = "update #(obj._meta.table) set #(assignments) where #(whereClause)"
    obj._meta.db.query (statementString, _.pick(obj, keys), statement = true)!
    obj.setNotChanged()

  foreignField(obj, field) =
    v = obj.(field)
    if (v :: Function)
      (obj.(field))()
    else
      v

  saveManyToOne(obj, field) =
    value = foreignField(obj, field)

    if (@not (value :: Array))
      value.save()!
      foreignId =
        if (obj._meta.foreignKeyFor)
          obj._meta.foreignKeyFor(field)
        else
          field + "_id"

      if (@not value._meta.compoundKey)
        obj.(foreignId) = value.identity()

  saveManyToOnes(obj) = [
    field <- foreignFieldsForObject(obj)
    saveManyToOne(obj, field)!
  ]

  saveOneToMany(obj, field) =
    items = foreignField(obj, field)
    if (items :: Array)
      [
        item <- items
        item.save()!
      ]

  saveOneToManys(obj) = [
    field <- foreignFieldsForObject(obj)
    saveOneToMany(obj, field)!
  ]

  hash(obj) =
    h = crypto.createHash 'md5'
    fields = [
      field <- fieldsForObject(obj)
      [field, obj.(field)]
    ]
    h.update (JSON.stringify(fields))
    h.digest 'hex'

  prototype {
    save(force = false) =
      if (@not self._saving)
        self.setSaving(true)

        try
          saveManyToOnes(self)!

          if (self.changed() @or force)
            if (@not self.saved())
              insert(self)!
            else
              update(self)!

          saveOneToManys(self)!
        finally
          self.setSaving(false)

    changed() =
      @not self._hash @or self._hash != hash(self)

    identity() =
      if (self._meta.compoundKey)
        [id <- self._meta.id, self.(id)]
      else
        self.(self._meta.id)

    saved() =
      self._saved

    setSaving(saving) =
      if (saving)
        Object.defineProperty(self, '_saving', value = true, configurable = true)
      else
        @delete self._saving

    setNotChanged() =
      if (self._hash)
        self._hash = hash(self)
      else
        Object.defineProperty(self, '_hash', value = hash(self), writable = true)

    setSaved() =
      if (@not self._saved)
        Object.defineProperty(self, '_saved', value = true)
  }

option (obj, property, value) =
  if (obj.hasOwnProperty(property))
    opt = obj.(property)
    @delete obj.(property)
    opt
  else
    value

exports.db(config) =
  db = {
    log =
      if (config)
        config.log

    config = config

    model (modelConfig) =
      foreignKeyFor = option(modelConfig, 'foreignKeyFor')
      id = option(modelConfig, 'id', 'id')
      table = option(modelConfig, 'table')

      modelConfig._meta = {
        table = table
        id = id
        db = self
        foreignKeyFor = foreignKeyFor
        compoundKey = id :: Array
      }

      modelPrototype = prototypeExtending (rowBase) (modelConfig)

      model (obj, saved = false, modified = false) =
        row = modelPrototype(obj)

        if (saved)
          row.setSaved()
          if (@not modified)
            row.setNotChanged()

        row

      model.query (args, ...) =
        [e <- db.query (args, ...)!, self(e, saved = true)]

      model

    query(query, params, statement: false) =
      try
        results = self.driver.query(query, params, statement: statement)!
        self.logResults(query, params, results, statement)
        results
      catch(e)
        self.logError(query, params, e)
        @throw e

    logError(query, params, error) =
      debugQuery(query, params, error)

    logResults(query, params, results, statement) =
      if (self.log :: Function)
        self.log (query, params, results, statement)
      else
        if (params)
          debugQuery(query, params)
        else
          debugQuery(query)

        if (@not statement @and results)
          debugResults(results)

    connect(config) =
      driver = {
        mssql = mssqlDriver
        pg = pgDriver
        mysql = mysqlDriver
        oracle = oracleDriver
      }.(config.driver)

      if (@not driver)
        @throw @new Error "no such driver: `#(config.driver)'"

      self.driver = driver()

      self.driver.connect(config)!

    close() =
      self.driver.close()
  }

  if (config)
    @{
      db.connect(config)!
      db
    }()
  else
    db


