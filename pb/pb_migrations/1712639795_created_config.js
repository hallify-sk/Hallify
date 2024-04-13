/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "olddhx6aukf5noj",
    "created": "2024-04-09 05:16:35.780Z",
    "updated": "2024-04-09 05:16:35.780Z",
    "name": "config",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "chqpbiov",
        "name": "label",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": 64,
          "pattern": ""
        }
      },
      {
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
      }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("olddhx6aukf5noj");

  return dao.deleteCollection(collection);
})
