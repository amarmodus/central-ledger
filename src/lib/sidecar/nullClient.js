'use strict'

const Logger = require('@mojaloop/central-services-shared').Logger

class NullClient {
  connect () {
    Logger.debug('Sidecar disabled: connecting in NullClient')
    return Promise.resolve(this)
  }

  write (msg) {
    Logger.debug(`Sidecar disabled: writing message ${msg} in NullClient`)
  }
}

exports.create = () => {
  return new NullClient()
}
