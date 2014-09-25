optionalRequire = require './optionalRequire'

module.exports() =
  pg = optionalRequire 'pg'

  {
    query(query, params) =
      paramList = []

      if (params)
        indexedParams = {}

        keys = Object.keys(params)
        for (n = 0, n < keys.length, ++n)
          key = keys.(n)
          value = params.(key)
          indexedParams.(key) = {
            index = n + 1
            value = value
          }
          paramList.push(value)

        query := query.replace (@new RegExp "@([a-zA-Z_0-9]+)\\b" 'g') @(_, paramName)
          param = indexedParams.(paramName)

          if (@not param)
            @throw @new Error "no such parameter @#(paramName)"

          "$" + indexedParams.(paramName).index

      self.client.query (query, paramList) ^!.rows

    connect(config) =
      promise @(result, error)
        pg.connect(config.url) @(err, client, done)
          if (err)
            error(err)
          else
            self.client = client
            self.done = done
            result()

    close() =
      if (self.done)
        self.done()

    outputIdBeforeValues(id) = ''
    outputIdAfterValues(id) = "returning #(id)"

    insertedId(rows, id) =
      rows.0.(id)
  }
