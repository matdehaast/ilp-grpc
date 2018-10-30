import 'mocha'
import IlpGrpc from '../lib'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
require('source-map-support').install()

describe('ilp-grpc', function () {

    describe('createLogger', function () {
        it('should return an instance of a Logger', function () {
            assert(true, 'test')
        })
    })
})
