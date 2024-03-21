import { build } from 'open-next/build.js'
import archiver from 'archiver';
import fs from 'fs';

export default class ServerlessOpenNext {
    constructor(serverless, options, { log }) {
        this.serverless = serverless
        this.options = options
        this.log = log

        this.commands = {
            'open-next': {
                commands: {
                    addFunctions: {lifecycleEvents: ['addFunctions']},
                    build: {lifecycleEvents: ['build', 'package']},
                }
            }
        }

        this.hooks = {
            "before:package:initialize": () => this.serverless.pluginManager.spawn('open-next:addFunctions'),
            "before:package:finalize": this.addResources.bind(this),
            "before:package:createDeploymentArtifacts": () => this.serverless.pluginManager.spawn('open-next:build'),
            "before:package:function:package": () => this.serverless.pluginManager.spawn('open-next:build'),
            "open-next:addFunctions:addFunctions": this.addFunctions.bind(this),
            "open-next:build:build": this.build.bind(this),
            "open-next:build:package": this.packageFunctions.bind(this),
        }
    }

    async build() {
        await build({
            dangerous: {
                disableIncrementalCache: true,
                disableDynamoDBCache: true
            }
        })
    }

    packageFunction(name) {
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', {})
            const output = fs.createWriteStream(`.open-next/${name}.zip`)
            output.on('close', function() {
                resolve()
            })
            archive.on('error', reject)
            archive.pipe(output)
            archive.glob('**', {cwd: `.open-next/${name}`})
            archive.glob('.next/**', {cwd: `.open-next/${name}`})
            archive.glob('.open-next/**', {cwd: `.open-next/${name}`})
            archive.finalize()
        })
    }

    async packageFunctions() {
        await Promise.all([
            this.packageFunction('server-function'),
        ])
    }

    addFunctions() {
        const functions = {
            server: {
                handler: 'index.handler',
                events: [],
                url: true,
                package: {
                    individually: true,
                    artifact: '.open-next/server-function.zip'
                }
            }
        }
        this.serverless.service.functions.server = functions.server
    }

    async addResources() {
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources['CloudFrontDistribution'] = {
            Type: 'AWS::CloudFront::Distribution',
            Properties: {
                DistributionConfig: {
                    Enabled: true,
                    HttpVersion: 'http2and3',
                    PriceClass: 'PriceClass_100',
                    IPV6Enabled: true,
                    Origins: [
                        {
                            Id: 'ServerFunction',
                            CustomOriginConfig: {
                                OriginProtocolPolicy: 'https-only',
                                OriginSSLProtocols: ['TLSv1.2']
                            },
                            DomainName: {
                                'Fn::Select': [2, {'Fn::Split': ['/', {'Fn::GetAtt': ['ServerLambdaFunctionUrl', 'FunctionUrl']}]}]
                            }
                        }
                    ],
                    DefaultCacheBehavior: {
                        AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
                        CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
                        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled
                        OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // AllViewerExceptHostHeader
                        TargetOriginId: 'ServerFunction',
                        ViewerProtocolPolicy: 'redirect-to-https',
                    }
                }
            },
        }
        this.serverless.service.provider.compiledCloudFormationTemplate.Outputs['CloudFrontURL'] = {
            Description: 'URL of the CloudFront distribution',
            Value: { 'Fn::GetAtt': ['CloudFrontDistribution', 'DomainName'] }
        }
    }
}