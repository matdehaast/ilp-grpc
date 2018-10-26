import { EventEmitter2, Listener } from 'eventemitter2'
const BtpPacket = require('btp-packet')

const DEFAULT_TIMEOUT = 35000

/**
 * Setup gRPC proto giles
 */
const PROTO_PATH = __dirname + '/proto/ilp.proto'
const grpc = require('grpc')
const protoLoader = require('@grpc/proto-loader')
// Suggested options for similarity to existing grpc.load behavior
const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    {keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition)
const interledger = protoDescriptor.interledger

export interface IlpGrpcConstructorOptions {
    server?: string,
    listener?: {
        port: number,
        secret: string
    }
    handleData: any
    accountId? : string
}

export interface BtpPacket {
    requestId: number
    type: number
    data: BtpPacketData
}

export interface BtpPacketData {
    protocolData: Array<BtpSubProtocol>
    amount?: string
    code?: string
    name?: string
    triggeredAt?: Date
    data?: string
}

export interface BtpSubProtocol {
    protocolName: string
    contentType: number
    data: Buffer
}


export default class IlpGrpc extends EventEmitter2 {

    private _listener?: {
        port: number
    }
    private _server?: string
    private _grpc: any
    private _streams: Map<string, any>
    protected _log: any
    protected _responseTimeout: number
    protected _handleData: any
    protected _accountId?: string

    constructor (options: IlpGrpcConstructorOptions) {
        super()
        this._listener = options.listener
        this._server = options.server
        this._log = console
        this._responseTimeout = DEFAULT_TIMEOUT
        this._handleData = options.handleData
        this._streams = new Map()
        if(options.accountId)
            this._accountId = options.accountId
    }

    async connect () {

        if (this._listener) {
            await this._setupServer()
        }

        if (this._server) {
            await this._setupClient()
        }
    }

    whichOne() : string {
        return this._server ? 'client' : 'server';
    }

    isServer() : boolean {
        return !this._server
    }

    async _handleIncomingDataStream (data: any, from: string = '') {
        let btpPacket: BtpPacket

        // TODO maybe need a check to see if correct btp packet?
        btpPacket = data

        try {
            await this._handleIncomingBtpPacket(from, btpPacket)
        } catch (err) {
            console.log(`Error processing BTP packet of type ${btpPacket.type}: `, err)
            const error = {code: "1", name: "2", triggeredAt: new Date(), data: ""}//jsErrorToBtpError(err)
            const requestId = btpPacket.requestId
            const { code, name, triggeredAt, data } = error

            await this._handleOutgoingBtpPacket(from, {
                type: BtpPacket.TYPE_ERROR,
                requestId,
                data: {
                    code,
                    name,
                    triggeredAt,
                    data,
                    protocolData: []
                }
            })
        }
    }

    protected async _handleIncomingBtpPacket (from: string, btpPacket: BtpPacket) {
        const { type, requestId, data} = btpPacket
        const typeString = BtpPacket.typeToString(type)

        this._log.trace(`received btp packet. type=${typeString} requestId=${requestId}`)
        let result: Array<BtpSubProtocol>
        switch (type) {
            case BtpPacket.TYPE_RESPONSE:
            case BtpPacket.TYPE_ERROR:
                this.emit('__callback_' + requestId, type, data)
                return
            case BtpPacket.TYPE_PREPARE:
            case BtpPacket.TYPE_FULFILL:
            case BtpPacket.TYPE_REJECT:
                throw new Error('Unsupported BTP packet')

            case BtpPacket.TYPE_TRANSFER:
                result = []
                // result = await this._handleMoney(from, btpPacket)
                break

            case BtpPacket.TYPE_MESSAGE:
                result = await this._handleData(from, btpPacket)
                break

            default:
                throw new Error('Unknown BTP packet type')
        }

        await this._handleOutgoingBtpPacket(from, {
            type: BtpPacket.TYPE_RESPONSE,
            requestId,
            data: { protocolData: result || [] }
        })
    }

    protected async _handleOutgoingBtpPacket (to: string, btpPacket: BtpPacket) {
        const { type, requestId} = btpPacket
        const typeString = BtpPacket.typeToString(type)
        console.log(`sending btp packet. type=${typeString} requestId=${requestId}`)
        try {
            let streamKey = this.isServer() ? to : 'server'
            await new Promise((resolve) => this._streams.get(streamKey).write(btpPacket, resolve))
        } catch (e) {
            console.log('unable to send btp message to client: ' + e.message, 'btp packet:', JSON.stringify(btpPacket))
        }
    }

    protected async _call (to: string, btpPacket: BtpPacket): Promise<BtpPacketData> {
        const requestId = btpPacket.requestId

        let callback: Listener
        let timer: NodeJS.Timer
        const response = new Promise<BtpPacketData>((resolve, reject) => {
            callback = (type: number, data: BtpPacketData) => {
                switch (type) {
                    case BtpPacket.TYPE_RESPONSE:
                        resolve(data)
                        clearTimeout(timer)
                        break

                    case BtpPacket.TYPE_ERROR:
                        reject(new Error(JSON.stringify(data)))
                        clearTimeout(timer)
                        break

                    default:
                        throw new Error('Unknown BTP packet type: ' + type)
                }
            }
            this.once('__callback_' + requestId, callback)
        })

        await this._handleOutgoingBtpPacket(to, btpPacket)

        const timeout = new Promise<BtpPacketData>((resolve, reject) => {
            timer = setTimeout(() => {
                this.removeListener('__callback_' + requestId, callback)
                reject(new Error(requestId + ' timed out'))
            }, this._responseTimeout)
        })

        return Promise.race([
            response,
            timeout
        ])
    }

    handleStreamData(call: any) {
        console.log('setup stream')
        let accountId = call.metadata.get('accountId')
        this._streams.set(accountId, call)
        this._streams.get(accountId).on('data', (data: any) => this._handleIncomingDataStream(data, accountId));
    }

    private async _setupServer() {
        this._grpc = new grpc.Server();
        this._grpc.addService(interledger.Interledger.service, {AddAccount: (call: any, callback: any) => {callback(null, {}) }, Stream: this.handleStreamData.bind(this)});
        // @ts-ignore
        this._grpc.bind('0.0.0.0:' + this._listener.port, grpc.ServerCredentials.createInsecure());
        this._grpc.start();
    }

    private async _setupClient() {
        this._grpc = new interledger.Interledger(this._server,
            grpc.credentials.createInsecure())
        let meta = new grpc.Metadata();
        meta.add('accountId', this._accountId);
        await this._streams.set('server', this._grpc.Stream(meta))
        this._streams.get('server').on('data', this._handleIncomingDataStream.bind(this));
    }

    async addAccount(data: any) : Promise<any> {
        return new Promise((resolve, reject) => {
            this._grpc.AddAccount(data, (error: any, response: any) => {
                if(error)
                    reject()
                resolve(response)
            })
        })
    }

    async sendData (buffer: Buffer): Promise<Buffer> {
        const response = await this._call('', {
            type: BtpPacket.TYPE_MESSAGE,
            requestId: 1234,
            data: { protocolData: [{
                    protocolName: 'ilp',
                    contentType: BtpPacket.MIME_APPLICATION_OCTET_STREAM,
                    data: buffer
                }] }
        })

        const ilpResponse = response.protocolData
            .filter(p => p.protocolName === 'ilp')[0]


        return ilpResponse
            ? ilpResponse.data
            : Buffer.alloc(0)
    }

}
