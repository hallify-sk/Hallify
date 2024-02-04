/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "1tyx58slhet80bx",
    "created": "2024-01-09 12:14:38.617Z",
    "updated": "2024-01-09 12:14:38.617Z",
    "name": "stages",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "zkyykjld",
        "name": "data",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "maxSize": 2000000
        }
      }
    ],
    "indexes": [
      "CREATE INDEX `idx_woSWG6S` ON `stages` (`created`)"
    ],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("1tyx58slhet80bx");

  return dao.deleteCollection(collection);
})
