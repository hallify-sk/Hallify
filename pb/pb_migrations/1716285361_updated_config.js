/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("olddhx6aukf5noj")

  // remove
  collection.schema.removeField("megsox7g")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "evcdsidj",
    "name": "data",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("olddhx6aukf5noj")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "megsox7g",
    "name": "value",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": 255,
      "pattern": ""
    }
  }))

  // remove
  collection.schema.removeField("evcdsidj")

  return dao.saveCollection(collection)
})
