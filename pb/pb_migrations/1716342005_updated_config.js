/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("olddhx6aukf5noj")

  // remove
  collection.schema.removeField("evcdsidj")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "kn8hmbxq",
    "name": "value",
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

  // remove
  collection.schema.removeField("kn8hmbxq")

  return dao.saveCollection(collection)
})
