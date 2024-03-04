/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "6btbabnw",
    "name": "guestCount",
    "type": "number",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "min": 0,
      "max": 120,
      "noDecimal": true
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ekg9mkrbjwgfj08")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "6btbabnw",
    "name": "guest_count",
    "type": "number",
    "required": true,
    "presentable": false,
    "unique": false,
    "options": {
      "min": 0,
      "max": 120,
      "noDecimal": true
    }
  }))

  return dao.saveCollection(collection)
})
