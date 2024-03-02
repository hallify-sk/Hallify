/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("bfhyz6xa3vcfu9h")

  collection.name = "temp_reservations"
  collection.indexes = [
    "CREATE INDEX `idx_Ohx2LIL` ON `temp_reservations` (`user`)",
    "CREATE UNIQUE INDEX `idx_9u5dAP4` ON `temp_reservations` (`date`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("bfhyz6xa3vcfu9h")

  collection.name = "reservations"
  collection.indexes = [
    "CREATE INDEX `idx_Ohx2LIL` ON `reservations` (`user`)",
    "CREATE UNIQUE INDEX `idx_9u5dAP4` ON `reservations` (`date`)"
  ]

  return dao.saveCollection(collection)
})
