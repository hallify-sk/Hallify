/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_U3EhCMd` ON `reservations` (`date`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  collection.indexes = []

  return dao.saveCollection(collection)
})
