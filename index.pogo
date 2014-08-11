crypto = require 'crypto'
_ = require 'underscore'
mssqlDriver = require './mssqlDriver'
pgDriver = require './pgDriver'

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

    r = obj._meta.db.query (statementString, _.pick(obj, keys))!

    obj.setSaved()
    if (@not obj._meta.compoundKey)
      obj.(obj._meta.id) = r.0.(obj._meta.id)

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
    obj._meta.db.query (statementString, _.pick(obj, keys))!
    obj.setNotChanged()

  saveManyToOne(obj, field) =
    value = obj.(field)
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
    items = obj.(field)
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
      if (self.changed() @or force)
        saveManyToOnes(self)!
        if (@not self.saved())
          insert(self)!
        else
          update(self)!

        saveOneToManys(self)!

    changed() =
      @not self._hash @or self._hash != hash(self)

    identity() =
      if (self._meta.compoundKey)
        [id <- self._meta.id, self.(id)]
      else
        self.(self._meta.id)

    saved() =
      self._saved

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

    query(query, params) =
      self.logQuery(query, params)
      self.driver.query(query, params)

    logQuery(query, params) =
      if (self.log)
        if (self.log :: Function)
          self.log (query, params)
        else
          console.log (query, params)

    connect(config) =
      self.driver =
        ({
          mssql = mssqlDriver
          pg = pgDriver
        }.(config.driver))()

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


