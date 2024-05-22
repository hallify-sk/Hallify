/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("olddhx6aukf5noj")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "3hgjkkv3",
    "name": "enabled",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("olddhx6aukf5noj")

  // remove
  collection.schema.removeField("3hgjkkv3")

  return dao.saveCollection(collection)
})
