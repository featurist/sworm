optionalRequire = require './optionalRequire'

module.exports() =
  mysql = optionalRequire 'mysql'

  {
    query(query, params) =
      paramList = []

      if (params)
        query := query.replace (@new RegExp "@([a-zA-Z_0-9]+)\\b" 'g') @(_, paramName)
          if (@not params.hasOwnProperty(paramName))
            @throw @new Error "no such parameter @#(paramName)"
          else
            paramList.push(params.(paramName))

          '?'

      self.connection.query (query, paramList) ^!

    connect(config) =
      config.config.multipleStatements = true
      self.connection = mysql.createConnection(config.config)
      self.connection.connect(^)!

    close() =
      self.connection.end()

    outputIdBeforeValues(id) = ''
    outputIdAfterValues(id) = '; select last_insert_id() as id'

    insertedId(rows, id) =
      (rows.1).0.id
  }
