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

 * ModusBox
 - Georgi Georgiev <georgi.georgiev@modusbox.com>
 - Rajiv Mothilal <rajiv.mothilal@modusbox.com>
 --------------
 ******/
'use strict'

const AwaitifyStream = require('awaitify-stream')
const Logger = require('@mojaloop/central-services-shared').Logger
const BulkTransferService = require('../../../domain/bulkTransfer')
const Util = require('@mojaloop/central-services-shared').Util
const Kafka = require('@mojaloop/central-services-shared').Util.Kafka
const Validator = require('../shared/validator')
const Enum = require('@mojaloop/central-services-shared').Enum
const Metrics = require('@mojaloop/central-services-metrics')
const Config = require('../../../lib/config')
const BulkTransferModels = require('@mojaloop/central-object-store').Models.BulkTransfer
const encodePayload = require('@mojaloop/central-services-stream/src/kafka/protocol').encodePayload

const location = { module: 'BulkFulfilHandler', method: '', path: '' } // var object used as pointer

const consumerCommit = true
/**
 * @function BulkFulfilHandler
 *
 * @async
 * @description This is the consumer callback function that gets registered to a topic. This then gets a list of messages,
 * we will only ever use the first message in non batch processing. We then break down the message into its payload and
 * begin validating the payload. Once the payload is validated successfully it will be written to the database to
 * the relevant tables. If the validation fails it is still written to the database for auditing purposes but with an
 * INVALID status. For any duplicate requests we will send appropriate callback based on the transfer state and the hash
 * validation.
 *
 * Module.method called to [TODO add description here]
 *
 * @param {error} error - error thrown if something fails within Kafka
 * @param {array} messages - a list of messages to consume for the relevant topic
 *
 * @returns {object} - Returns a boolean: true if successful, or throws and error if failed
 */
const bulkFulfil = async (error, messages) => {
  const histTimerEnd = Metrics.getHistogram(
    'transfer_bulk_fulfil',
    'Consume a bulkFulfil transfer message from the kafka topic and process it accordingly',
    ['success', 'fspId']
  ).startTimer()
  if (error) {
    throw error
  }
  let message = {}
  try {
    if (Array.isArray(messages)) {
      message = messages[0]
    } else {
      message = messages
    }
    const messageId = message.value.id
    const payload = message.value.content.payload
    const headers = message.value.content.headers
    const action = message.value.metadata.event.action
    const bulkTransferId = payload.bulkTransferId
    const kafkaTopic = message.topic
    let consumer
    Logger.info(Util.breadcrumb(location, { method: 'bulkFulfil' }))
    try {
      consumer = Kafka.Consumer.getConsumer(kafkaTopic)
    } catch (err) {
      Logger.info(`No consumer found for topic ${kafkaTopic}`)
      Logger.error(err)
      histTimerEnd({ success: false, fspId: Config.INSTRUMENTATION_METRICS_LABELS.fspId })
      return true
    }
    const actionLetter = action === Enum.Events.Event.Action.BULK_COMMIT ? Enum.Events.ActionLetter.bulkCommit : Enum.Events.ActionLetter.unknown
    let params = { message, kafkaTopic, consumer, decodedPayload: payload }

    Logger.info(Util.breadcrumb(location, { path: 'dupCheck' }))
    const isFulfilment = true
    const { isDuplicateId, isResend, identity } = await BulkTransferService.checkDuplicate(bulkTransferId, payload.hash, isFulfilment)
    if (isDuplicateId && isResend) { // TODO: handle resend
      Logger.info(Util.breadcrumb(location, 'resend'))
      Logger.info(Util.breadcrumb(location, 'notImplemented'))
      return true
    }
    if (isDuplicateId && !isResend) { // TODO: handle modified request
      Logger.error(Util.breadcrumb(location, `callbackErrorModified1--${actionLetter}4`))
      Logger.info(Util.breadcrumb(location, 'notImplemented'))
      return true
    }

    // TODO: move FSPIOP-Source validation before Transfer Duplicate Check to accept only Payee's first request
    const { isValid, reasons } = await Validator.validateBulkTransferFulfilment(payload, headers)
    if (isValid) {
      let state
      Logger.info(Util.breadcrumb(location, { path: 'isValid' }))
      try {
        Logger.info(Util.breadcrumb(location, 'saveBulkTransfer'))
        state = await BulkTransferService.bulkFulfil(payload, identity)
      } catch (err) { // TODO: handle insert errors
        Logger.info(Util.breadcrumb(location, `callbackErrorInternal1--${actionLetter}5`))
        Logger.info(Util.breadcrumb(location, 'notImplemented'))
        return true
      }
      try {
        Logger.info(Util.breadcrumb(location, 'individualTransferFulfils'))
        // stream initialization
        const IndividualTransferFulfilModel = BulkTransferModels.getIndividualTransferFulfilModel()
        const indvidualTransfersFulfilStream = IndividualTransferFulfilModel.find({ messageId }).cursor()
        // enable async/await operations for the stream
        const streamReader = AwaitifyStream.createReader(indvidualTransfersFulfilStream)
        let doc
        while ((doc = await streamReader.readAsync()) !== null) {
          const individualTransferFulfil = doc.payload
          const transferId = individualTransferFulfil.transferId
          delete individualTransferFulfil.transferId
          const bulkTransferAssociationRecord = {
            transferId,
            bulkTransferId: payload.bulkTransferId,
            bulkProcessingStateId: Enum.BulkProcessingState.PROCESSING
          }
          await BulkTransferService.bulkTransferAssociationUpdate(transferId, bulkTransferId, bulkTransferAssociationRecord)
          if (state === Enum.BulkTransferState.INVALID ||
            individualTransferFulfil.errorInformation ||
            !individualTransferFulfil.fulfilment) {
            individualTransferFulfil.transferState = Enum.TransferStateEnum.ABORTED
          } else {
            individualTransferFulfil.transferState = Enum.TransferStateEnum.COMMITTED
          }
          const dataUri = encodePayload(JSON.stringify(individualTransferFulfil), headers[Enum.Http.Headers.GENERAL.CONTENT_TYPE.value])
          const metadata = Util.StreamingProtocol.createMetadataWithCorrelatedEventState(message.value.metadata.event.id, Enum.Events.Event.Type.FULFIL, Enum.Events.Event.Action.COMMIT, Enum.Events.EventStatus.SUCCESS.status, Enum.Events.EventStatus.SUCCESS.code, Enum.Events.EventStatus.SUCCESS.description) // TODO: switch action to 'bulk-fulfil' flow
          const msg = {
            value: Util.StreamingProtocol.createMessage(messageId, headers[Enum.Http.Headers.FSPIOP.DESTINATION], headers[Enum.Http.Headers.FSPIOP.SOURCE], metadata, headers, dataUri, { id: transferId })
          }
          params = { message: msg, kafkaTopic, consumer }
          const producer = { functionality: Enum.Events.Event.Type.FULFIL, action: Enum.Events.Event.Action.BULK_COMMIT }
          await Kafka.proceed(Config.KAFKA_CONFIG, params, { consumerCommit, histTimerEnd, producer })
          histTimerEnd({ success: true, fspId: Config.INSTRUMENTATION_METRICS_LABELS.fspId })
        }
      } catch (err) { // TODO: handle individual transfers streaming error
        Logger.info(Util.breadcrumb(location, `callbackErrorInternal2--${actionLetter}6`))
        Logger.info(Util.breadcrumb(location, 'notImplemented'))
        return true
      }
    } else { // TODO: handle validation failure
      Logger.error(Util.breadcrumb(location, { path: 'validationFailed' }))
      try {
        Logger.info(Util.breadcrumb(location, 'saveInvalidRequest'))
        await BulkTransferService.bulkFulfil(payload, reasons.toString(), false)
      } catch (err) { // TODO: handle insert error
        Logger.info(Util.breadcrumb(location, `callbackErrorInternal2--${actionLetter}7`))
        Logger.info(Util.breadcrumb(location, 'notImplemented'))
        return true
      }
      Logger.info(Util.breadcrumb(location, `callbackErrorGeneric--${actionLetter}8`))
      Logger.info(Util.breadcrumb(location, 'notImplemented'))
      return true // TODO: store invalid bulk transfer to database and produce callback notification to payer
    }
  } catch (err) {
    Logger.error(`${Util.breadcrumb(location)}::${err.message}--BP0`)
    histTimerEnd({ success: false, fspId: Config.INSTRUMENTATION_METRICS_LABELS.fspId })
    throw err
  }
}

/**
 * @function registerBulkFulfilHandler
 *
 * @async
 * @description Registers the handler for bulk-transfer topic. Gets Kafka config from default.json
 *
 * @returns {boolean} - Returns a boolean: true if successful, or throws and error if failed
 */
const registerBulkFulfilHandler = async () => {
  try {
    const bulkFulfilHandler = {
      command: bulkFulfil,
      topicName: Kafka.transformGeneralTopicName(Config.KAFKA_CONFIG.TOPIC_TEMPLATES.GENERAL_TOPIC_TEMPLATE.TEMPLATE, Enum.Events.Event.Type.BULK, Enum.Events.Event.Action.FULFIL),
      config: Kafka.getKafkaConfig(Config.KAFKA_CONFIG, Enum.Kafka.Config.CONSUMER, Enum.Events.Event.Type.BULK.toUpperCase(), Enum.Events.Event.Action.FULFIL.toUpperCase())
    }
    bulkFulfilHandler.config.rdkafkaConf['client.id'] = bulkFulfilHandler.topicName
    await Kafka.Consumer.createHandler(bulkFulfilHandler.topicName, bulkFulfilHandler.config, bulkFulfilHandler.command)
    return true
  } catch (err) {
    Logger.error(err)
    throw err
  }
}

/**
 * @function RegisterAllHandlers
 *
 * @async
 * @description Registers all module handlers
 *
 * @returns {boolean} - Returns a boolean: true if successful, or throws and error if failed
 */
const registerAllHandlers = async () => {
  try {
    await registerBulkFulfilHandler()
    return true
  } catch (err) {
    Logger.error(err)
    throw err
  }
}

module.exports = {
  bulkFulfil,
  registerBulkFulfilHandler,
  registerAllHandlers
}
