/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("bfhyz6xa3vcfu9h")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "qyy6xzds",
    "name": "guestCount",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "tbbvtm5o",
    "name": "category",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "hgj9brjypc8a3h3",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "0flcgrs3",
    "name": "addons",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "2wj14qwcyq8zgd3",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": null,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("bfhyz6xa3vcfu9h")

  // remove
  collection.schema.removeField("qyy6xzds")

  // remove
  collection.schema.removeField("tbbvtm5o")

  // remove
  collection.schema.removeField("0flcgrs3")

  return dao.saveCollection(collection)
})
