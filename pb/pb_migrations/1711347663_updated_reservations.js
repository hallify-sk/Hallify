/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  collection.updateRule = "@request.data.date:isset = false && date > @todayStart && @request.auth.id = user"
  collection.deleteRule = "date > @todayStart && @request.auth.id = user"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  collection.updateRule = "@request.data.date:isset = false && date > @todayStart"
  collection.deleteRule = "date > @todayStart"

  return dao.saveCollection(collection)
})
