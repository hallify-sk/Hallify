/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("1tyx58slhet80bx")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "o4smd0yz",
    "name": "categories",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "hgj9brjypc8a3h3",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": null,
      "displayFields": null
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "vdnp2dn3",
    "name": "name",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("1tyx58slhet80bx")

  // remove
  collection.schema.removeField("o4smd0yz")

  // remove
  collection.schema.removeField("vdnp2dn3")

  return dao.saveCollection(collection)
})
