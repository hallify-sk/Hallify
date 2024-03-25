/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  collection.createRule = "@request.auth.id = user"
  collection.updateRule = "@request.data.date:isset = false && date > @todayStart"
  collection.deleteRule = "date > @todayStart"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  collection.createRule = ""
  collection.updateRule = "@request.data.date:isset = false && @request.data.date > @todayStart"
  collection.deleteRule = ""

  return dao.saveCollection(collection)
})
