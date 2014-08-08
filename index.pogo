sql = require 'mssql'
crypto = require 'crypto'

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

  logSql(obj, sql) =
    if (obj._meta.db.log)
      if (obj._meta.db.log :: Function)
        obj._meta.db.log (sql)
      else
        console.log (sql)

  insert(obj) =
    keys = fieldsForObject(obj)
    fields = keys.join ', '
    values = [
      key <- keys
      '@' + key
    ].join ', '

    request = @new sql.Request(obj._meta.db.connection)

    outputId =
      if (obj._meta.id :: String)
        "output Inserted.#(obj._meta.id)"
      else
        ''

    for each @(name) in (keys)
      request.input(name, obj.(name))

    statementString = "insert into #(obj._meta.table) (#(fields)) #(outputId) values (#(values))" 
    logSql(obj, statementString)

    r = request.query (statementString) ^!

    obj.setSaved()
    if (@not obj._meta.compoundKey)
      obj.(obj._meta.id) = r.0.(obj._meta.id)

    obj.setNotChanged()

  update(obj) =
    keys = fieldsForObject(obj)
    assignments = [
      key <- keys
      key != obj._meta.id
      "#(key) = @#(key)"
    ].join ', '

    request = @new sql.Request(obj._meta.db.connection)

    for each @(n) in (keys)
      if (n != obj._meta.id)
        request.input(n, obj.(n))

    whereClause =
      if (obj._meta.compoundKey)
        for each @(name) in (obj._meta.compoundKey)
          request.input (name, obj.(name))

        [key <- obj._meta.id, "#(key) = @#(key)"].join ' and '
      else
        request.input (obj._meta.id, obj.identity())

        "#(obj._meta.id) = @#(obj._meta.id)"

    statementString = "update #(obj._meta.table) set #(assignments) where #(whereClause)" 
    logSql(obj, statementString)

    request.query (statementString) ^!
    obj.setNotChanged()

  saveManyToOne(obj, field) =
    value = obj.(field)
    if (@not (value :: Array))
      value.save()!
      foreignId =
        if (obj._meta.foreignKeyFor)
          obj._meta.foreignKeyFor(field)
        else
          field + "Id"

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

      model (obj, saved) =
        row = modelPrototype(obj)

        if (saved)
          row.setSaved()
          row.setNotChanged()

        row
      
      model.query (args, ...) =
        [e <- db.query (args, ...)!, self(e, true)]

      model

    query(query, params) =
      request = @new sql.Request(self.connection)

      if (params)
        for each @(key) in (Object.keys(params))
          request.input(key, params.(key))

      request.query (query) ^!

    connect(config) =
      self.connection := @new sql.Connection(config)
      self.connection.connect(^)!

    close() =
      self.connection.close()
  }

  if (config)
    @{
      db.connect(config)!
      db
    }()
  else
    db
