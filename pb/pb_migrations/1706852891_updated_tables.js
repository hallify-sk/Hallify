/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("yg2u2arwhy2hoan")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "lp2wxqkz",
    "name": "maxChairsPerSide",
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

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("yg2u2arwhy2hoan")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "lp2wxqkz",
    "name": "maxChairs",
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

  return dao.saveCollection(collection)
})
