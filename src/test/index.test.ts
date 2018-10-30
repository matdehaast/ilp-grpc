import 'mocha'
import IlpGrpc from '../lib'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import * as IlpPacket from "ilp-packet";
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)
require('source-map-support').install()

const crypto = require('crypto')
function sha256 (preimage: any) { return crypto.createHash('sha256').update(preimage).digest() }
const fulfillment = crypto.randomBytes(32)
const condition = sha256(fulfillment)

describe('ilp-grpc', function () {

    let clientOpts : any, serverOpts : any

    beforeEach(async () => {
        clientOpts = {
            server: 'localhost:9000',
            responseTimeout: 100
        }

        serverOpts = {
            listener: {
                port: 9000,
                secret: 'secret'
            },
            responseTimeout: 100
        }
    })

    describe('connect real grpc', function () {

        it('connects the client and server', async function () {
            let server = new IlpGrpc({
                listener: {
                    port: 5502,
                    secret: ''
                },
                dataHandler: (from: string, data: Buffer) =>
                    new Promise((resolve) => {
                        resolve(IlpPacket.serializeIlpFulfill({
                            fulfillment,
                            data: Buffer.from('thank you')
                        }))
                    })
            })

            await server.connect()

            let client = new IlpGrpc({
                server: "0.0.0.0:5502",
                accountId: 'test',
                dataHandler: (from, data) =>
                    new Promise((resolve) => {
                        resolve(IlpPacket.serializeIlpFulfill({
                            fulfillment,
                            data: Buffer.from('thank you')
                        }))
                    })
            })

            await client.connect()

            await new Promise(resolve=>{
                setTimeout(resolve,100)
            })

            const preparePacket = IlpPacket.serializeIlpPrepare({
                amount: '100',
                executionCondition: Buffer.from('I3TZF5S3n0-07JWH0s8ArsxPmVP6s-0d0SqxR6C3Ifk', 'base64'),
                expiresAt: new Date(),
                destination: 'mock.test2.bob',
                data: Buffer.alloc(0)
            })

            let response = await server.sendData(preparePacket, 'test')
            let ilp = IlpPacket.deserializeIlpFulfill(response)
            assert.equal('thank you', ilp.data.toString('utf8'))
        })

    })
})
