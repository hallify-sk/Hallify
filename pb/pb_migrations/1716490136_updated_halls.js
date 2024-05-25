/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("i53bubcgebvw0bf")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_rD9m1Ed` ON `halls` (`name`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("i53bubcgebvw0bf")

  collection.indexes = []

  return dao.saveCollection(collection)
})
