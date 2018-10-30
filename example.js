const BtpPacket = require("btp-packet");

const IlpGrpc = require('./src').default
const IlpPacket = require('ilp-packet')
const crypto = require('crypto')
function sha256 (preimage) { return crypto.createHash('sha256').update(preimage).digest() }
const fulfillment = crypto.randomBytes(32)
const condition = sha256(fulfillment)

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function main() {
    let server = new IlpGrpc({
        listener: {port: 5505},
        dataHandler: (from, data) =>
            IlpPacket.serializeIlpFulfill({
                fulfillment,
                data: Buffer.from('thank you')
            }),
        addAccountHandler: (id, info) => {
            console.log(id, info)
        },
        connectionChangeHandler: (id, isConnected) => {
            console.log('account', id, 'connection status', isConnected)
        },
        removeAccountHandler: (id) => {
            console.log('remove account: ' + id)
        }
    })
    await server.connect()

    let client = new IlpGrpc({
        server: "0.0.0.0:5505",
        accountId: 'test',
        dataHandler: (from, data) =>
            IlpPacket.serializeIlpFulfill({
                fulfillment,
                data: Buffer.from('thank you')
            })
    })
    //
    // console.log('update')
    //
    await client.connect()

    await sleep(10)

    //
    // console.log('update')
    //
    // try {
    //     await client.addAccount({
    //         id: 'matt',
    //         info: {
    //             relation: 'child',
    //             assetScale: 9,
    //             assetCode: 'xrp'
    //         }
    //     })
    // } catch(error) {
    //     console.log(error)
    // }
    //
    // console.log('update')
    // await client.updateConnectionStatus(true)
    //
    // console.log('delete client')
    // delete client
    // console.log('client deleted')
    // console.log(server._streams.get('test').write('test'))
    const preparePacket = IlpPacket.serializeIlpPrepare({
        amount: '100',
        executionCondition: Buffer.from('I3TZF5S3n0-07JWH0s8ArsxPmVP6s-0d0SqxR6C3Ifk', 'base64'),
        expiresAt: new Date(),
        destination: 'mock.test2.bob',
        data: Buffer.alloc(0)
    })

    let response = await server.sendData(preparePacket, 'test')
    console.log(response)

}


main()
