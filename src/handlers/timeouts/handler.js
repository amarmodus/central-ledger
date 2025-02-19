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

/**
 * @module src/handlers/timeout
 */

const CronJob = require('cron').CronJob
const Config = require('../../lib/config')
const TimeoutService = require('../../domain/timeout')
const Enum = require('@mojaloop/central-services-shared').Enum
const Kafka = require('@mojaloop/central-services-shared').Util.Kafka
const Utility = require('@mojaloop/central-services-shared').Util
const ErrorHandler = require('@mojaloop/central-services-error-handling')

let timeoutJob
let isRegistered

/**
 * @function TransferTimeoutHandler
 *
 * @async
 * @description This is the consumer callback function that gets registered to a cron job.
 *
 * ... called to validate/insert ...
 *
 * @param {error} error - error thrown if something fails within Cron
 *
 * @returns {boolean} - Returns a boolean: true if successful, or throws and error if failed
 */
const timeout = async () => {
  try {
    const timeoutSegment = await TimeoutService.getTimeoutSegment()
    const intervalMin = timeoutSegment ? timeoutSegment.value : 0
    const segmentId = timeoutSegment ? timeoutSegment.segmentId : 0
    const cleanup = await TimeoutService.cleanupTransferTimeout()
    const latestTransferStateChange = await TimeoutService.getLatestTransferStateChange()
    const intervalMax = (latestTransferStateChange && parseInt(latestTransferStateChange.transferStateChangeId)) || 0
    const result = await TimeoutService.timeoutExpireReserved(segmentId, intervalMin, intervalMax)
    const fspiopExpiredError = ErrorHandler.Factory.createFSPIOPError(ErrorHandler.Enums.FSPIOPErrorCodes.EXPIRED_ERROR, 'Transfer has expired at the switch').toApiErrorObject(Config.ERROR_HANDLING)
    if (!Array.isArray(result)) {
      result[0] = result
    }
    for (let i = 0; i < result.length; i++) {
      const state = Utility.StreamingProtocol.createEventState(Enum.Events.EventStatus.FAILURE.status, fspiopExpiredError.errorInformation.errorCode, fspiopExpiredError.errorInformation.errorDescription)
      const metadata = Utility.StreamingProtocol.createMetadataWithCorrelatedEvent(result[i].transferId, Enum.Kafka.Topics.NOTIFICATION, Enum.Events.Event.Action.TIMEOUT_RECEIVED, state)
      const headers = Utility.Http.SwitchDefaultHeaders(result[i].payerFsp, Enum.Http.HeaderResources.TRANSFERS, Enum.Http.Headers.FSPIOP.SWITCH.value)
      const message = Utility.StreamingProtocol.createMessage(result[i].transferId, result[i].payeeFsp, result[i].payerFsp, metadata, headers, fspiopExpiredError, { id: result[i].transferId }, 'application/vnd.interoperability.transfers+json;version=1.0')
      if (result[i].transferStateId === Enum.Transfers.TransferInternalState.EXPIRED_PREPARED) {
        message.to = message.from
        message.from = Enum.Http.Headers.FSPIOP.SWITCH.value
        await Kafka.produceGeneralMessage(Config.KAFKA_CONFIG, Enum.Kafka.Topics.NOTIFICATION, Enum.Events.Event.Action.TIMEOUT_RECEIVED, message, state)
      } else if (result[i].transferStateId === Enum.Transfers.TransferInternalState.RESERVED_TIMEOUT) {
        message.metadata.event.action = Enum.Events.Event.Action.TIMEOUT_RESERVED
        await Kafka.produceGeneralMessage(Config.KAFKA_CONFIG, Enum.Kafka.Topics.POSITION, Enum.Events.Event.Action.TIMEOUT_RESERVED, message, state, result[i].payerFsp)
      }
    }
    return {
      intervalMin,
      cleanup,
      intervalMax,
      result
    }
  } catch (err) {
    throw ErrorHandler.Factory.reformatFSPIOPError(err)
  }
}

/**
 * @function isRunning
 *
 * @description Function to determine if the timeoutJob is running
 *
 * @returns {boolean} Returns true if the timeoutJob is running
 */
const isRunning = async () => {
  return isRegistered
}

/**
 * @function stop
 *
 * @description Function to stop the timeoutJob if running
 *
 * @returns {boolean} Returns true when the job is stopped
 */
const stop = async () => {
  if (isRegistered) {
    await timeoutJob.stop()
    isRegistered = undefined
  }
}

/**
 * @function RegisterTimeoutHandlers
 *
 * @async
 * @description Registers the timeout handler by starting the timeoutJob cron
 * @returns {boolean} - Returns a boolean: true if successful, or throws and error if failed
 */
const registerTimeoutHandler = async () => {
  try {
    if (isRegistered) {
      await stop()
    }

    timeoutJob = new CronJob({
      cronTime: Config.HANDLERS_TIMEOUT_TIMEXP,
      onTick: timeout,
      start: false,
      timeZone: Config.HANDLERS_CRON_TIMEZONE
    })
    isRegistered = true

    await timeoutJob.start()
    return true
  } catch (err) {
    throw ErrorHandler.Factory.reformatFSPIOPError(err)
  }
}

/**
 * @function RegisterAllHandlers
 *
 * @async
 * @description Registers all handlers in timeouts
 *
 * @returns {boolean} - Returns a boolean: true if successful, or throws and error if failed
 */
const registerAllHandlers = async () => {
  try {
    if (!Config.HANDLERS_TIMEOUT_DISABLED) {
      await registerTimeoutHandler()
    }
    return true
  } catch (err) {
    throw ErrorHandler.Factory.reformatFSPIOPError(err)
  }
}

module.exports = {
  timeout,
  registerAllHandlers,
  registerTimeoutHandler,
  isRunning,
  stop
}
