sql = require 'mssql'
crypto = require 'crypto'

rowBase =
  keysForObject(obj) = [
    key <- Object.keys(obj)
    @not r/^_/.test(key) @and key != obj._meta.id
    key
  ]

  fieldsForObject(obj) = [
    key <- keysForObject(obj)
    value = obj.(key)
    (value :: Date) @or (value != null @and value != nil @and @not (value :: Object))
    key
  ]

  foreignFieldsForObject(obj) = [
    key <- keysForObject(obj)
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
      (obj.(key)) toSql
    ].join ', '

    request = @new sql.Request(obj._meta.connection)
    statementString = "insert into #(obj._meta.table) (#(fields)) output Inserted.#(obj._meta.id) values (#(values))" 
    if (obj._meta.log)
      console.log (statementString)

    r = request.query (statementString) ^!
    obj.(obj._meta.id) = r.0.(obj._meta.id)

    obj.setNotChanged()

  update(obj) =
    keys = fieldsForObject(obj)
    assignments = [
      key <- keys
      sqlValue = (obj.(key)) toSql
      "#(key) = #(sqlValue)"
    ].join ', '

    request = @new sql.Request(obj._meta.connection)
    statementString = "update #(obj._meta.table) set #(assignments) where #(obj._meta.id) = #(obj.identity())" 
    if (obj._meta.log)
      console.log (statementString)

    request.query (statementString) ^!

  saveManyToOne(obj, field) =
    value = obj.(field)
    if (@not (value :: Array))
      value.save()!
      foreignId =
        if (obj._meta.foreignKeyFor)
          obj._meta.foreignKeyFor(field)
        else
          field + "Id"

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
      if (self.changed() @and @not force)
        saveManyToOnes(self)!
        if (@not self.identity())
          insert(self)!
        else
          update(self)!

        saveOneToManys(self)!

    changed() =
      self._hash != hash(self)

    identity() =
      self.(self._meta.id)

    setNotChanged() =
      Object.defineProperty(self, '_hash', value = hash(self))
  }

exports.db(config) =
  db = {
    row (rowConfig) =
      table = rowConfig.table
      @delete rowConfig.table

      id = rowConfig.id @or 'id'
      @delete rowConfig.id

      log = rowConfig.log @or false
      @delete rowConfig.log

      foreignKeyFor = rowConfig.foreignKeyFor @or false
      @delete rowConfig.foreignKeyFor

      rowConfig._meta = {
        table = table
        id = id
        log = log
        connection = self.connection
        foreignKeyFor = foreignKeyFor
      }

      rowPrototype = prototypeExtending (rowBase) (rowConfig)

      @(obj)
        row = rowPrototype(obj)

        if (row.identity())
          row.setNotChanged()

        row

    query(query) =
      request = @new sql.Request(self.connection)
      records = request.query (query) ^!

    connect() =
      self.connection := @new sql.Connection(config)
      self.connection.connect(^)!

    close() =
      self.connection.close()
  }

  db.connect()!
  db

(v) toSql =
  if (v :: String)
    "'" + v.replace r/'/g "''" + "'"
  else if (v :: Date)
    "'" + v.toISOString() + "'"
  else if (v :: Boolean)
    if (v)
      1
    else
      0
  else if (v :: Number)
    v
  else
    @throw @new Error "could not pass value to query: #(v)"
