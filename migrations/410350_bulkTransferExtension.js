/*****
 License
 --------------
 Copyright © 2017 Bill & Melinda Gates Foundation
 The Mojaloop files are made available by the Bill & Melinda Gates Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Gates Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Gates Foundation
 - Name Surname <name.surname@gatesfoundation.com>

 * Georgi Georgiev <georgi.georgiev@modusbox.com>
 --------------
 ******/

'use strict'

exports.up = async (knex, Promise) => {
  return await knex.schema.hasTable('bulkTransferExtension').then(function(exists) {
    if (!exists) {
      return knex.schema.createTable('bulkTransferExtension', (t) => {
        t.bigIncrements('bulkTransferExtensionId').primary().notNullable()
        t.string('bulkTransferId', 36).notNullable()
        t.foreign('bulkTransferId').references('bulkTransferId').inTable('bulkTransfer')
        t.bigInteger('bulkTransferFulfilmentId').unsigned().defaultTo(null).nullable()
        t.foreign('bulkTransferFulfilmentId').references('bulkTransferFulfilmentId').inTable('bulkTransferFulfilment')
        t.string('key', 128).notNullable()
        t.text('value').notNullable()
        t.dateTime('createdDate').defaultTo(knex.fn.now()).notNullable()
      })
    }
  })
}

exports.down = function (knex, Promise) {
  return knex.schema.dropTableIfExists('transferExtension')
}
