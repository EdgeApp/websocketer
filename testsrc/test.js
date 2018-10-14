/**
 * Created by paul on 9/8/17.
 */

/* global describe it */
const assert = require('assert')

describe('No tests', function () {
  it('Really no tests', function (done) {
    this.timeout(120000)
    assert.doesNotThrow(() => {
      // checkServers([]).then(servers => {
      //   assert.equal(servers.BTC.length >= 1, true)
      //   assert.equal(servers.BC1.length >= 1, true)
      //   assert.equal(servers.BCH.length >= 1, true)
      //   assert.equal(servers.LTC.length >= 1, true)
      //   assert.equal(servers.DASH.length >= 1, true)
      done()
      // })
    })
  })
})
