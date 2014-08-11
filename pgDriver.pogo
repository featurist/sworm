pg = require 'pg'

module.exports() = {
  query(query, params) =
    paramList = []

    if (params)
      n = 1
      for each @(key) in (Object.keys(params))
        query := query.replace (@new RegExp "@#(key)\\b" 'g') "$#(n)"
        paramList.push(params.(key))
        ++n

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
}
