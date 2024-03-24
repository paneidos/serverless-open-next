import { build } from 'open-next/build.js'
import archiver from 'archiver';
import fs from 'fs';
import { readdir, readFile } from 'fs/promises';
import mime from 'mime';
import { StandardCacheBehaviours, StandardOrigins } from "./cloudfront.js";
import {StandardCacheControl, StandardSiteBucket, StandardSiteBucketPolicy} from "./s3.js";

export default class ServerlessOpenNext {
    constructor(serverless, options, { log }) {
        this.serverless = serverless
        this.provider = this.serverless.getProvider('aws');
        this.options = options
        this.log = log

        this.commands = {
            'open-next': {
                commands: {
                    addFunctions: {lifecycleEvents: ['addFunctions']},
                    build: {lifecycleEvents: ['build', 'package']},
                    upload: {lifecycleEvents: ['upload']},
                }
            }
        }

        this.hooks = {
            "before:package:initialize": () => this.serverless.pluginManager.spawn('open-next:addFunctions'),
            "before:info:info": () => this.serverless.pluginManager.spawn('open-next:addFunctions'),
            "after:aws:info:displayEndpoints": this.addSiteUrl.bind(this),
            "before:package:finalize": this.addResources.bind(this),
            "before:package:createDeploymentArtifacts": () => this.serverless.pluginManager.spawn('open-next:build'),
            "before:package:function:package": () => this.serverless.pluginManager.spawn('open-next:build'),
            "after:deploy:deploy": () => this.serverless.pluginManager.spawn('open-next:upload'),
            "open-next:addFunctions:addFunctions": this.addFunctions.bind(this),
            "open-next:build:build": this.build.bind(this),
            "open-next:build:package": this.packageFunctions.bind(this),
            "open-next:upload:upload": this.uploadAssets.bind(this),
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
            this.packageFunction('image-optimization-function'),
        ])
    }

    async getStackOutputs() {
        const stackName = this.provider.naming.getStackName();
        const result = await this.provider.request('CloudFormation', 'describeStacks', { StackName: stackName });
        if (result.Stacks.length === 0) {
            return {}
        }
        return result.Stacks[0].Outputs.reduce((obj, output) => {
            return {
                ...obj,
                [output.OutputKey]: output.OutputValue,
            }
        }, {});
    }

    async addSiteUrl() {
        const outputs = await this.getStackOutputs()
        if (outputs.SiteURL !== undefined) {
            this.serverless.serviceOutputs.set('site', outputs.SiteURL)
        }
    }

    async uploadAssets() {
        const outputs = await this.getStackOutputs();
        const bucketName = outputs.SiteBucketName;
        const files = await readdir('.open-next/assets', { recursive: true, withFileTypes: true });
        const cacheControls = StandardCacheControl;
        for (const file of files) {
            if (!file.isFile()) {
                continue;
            }
            const fullPath = file.path + '/' + file.name
            const baseKey = fullPath.substring(18)
            const targetKey = '_assets/' + baseKey
            const cacheControl = baseKey.startsWith('_next/') ? cacheControls.immutable : cacheControls.normal
            const params = {
                Body: await readFile(fullPath),
                Bucket: bucketName,
                Key: targetKey,
                CacheControl: cacheControl,
                ContentType: mime.getType(fullPath)
            }
            await this.provider.request('S3', 'putObject', params);
        }
    }

    addFunctions() {
        const service = this.serverless.service.service
        const stage = this.provider.getStage()
        const clearDefaultEnvironment = Object.fromEntries(Object.keys(this.serverless.service.provider.environment).map(key => [key, null]))
        const functions = {
            server: {
                name: `${service}-${stage}-server`,
                handler: 'index.handler',
                timeout: 10,
                memorySize: 1024,
                events: [],
                url: true,
                package: {
                    individually: true,
                    artifact: '.open-next/server-function.zip'
                },
                environment: {
                    CACHE_BUCKET_KEY_PREFIX: '_cache',
                    CACHE_BUCKET_NAME: { Ref: 'SiteBucket' },
                    CACHE_BUCKET_REGION: { Ref: 'AWS::Region' },
                }
            },
            image: {
                name: `${service}-${stage}-image`,
                handler: 'index.handler',
                architecture: 'arm64',
                role: 'ImageFunctionRole',
                timeout: 25,
                memorySize: 1536,
                events: [],
                url: true,
                package: {
                    individually: true,
                    artifact: '.open-next/image-optimization-function.zip'
                },
                environment: {
                    ...clearDefaultEnvironment,
                    BUCKET_KEY_PREFIX: '_assets',
                    BUCKET_NAME: { Ref: 'SiteBucket' },
                }
            }
        }
        this.serverless.service.functions.server = functions.server
        this.serverless.service.functions.image = functions.image

    }

    addResource(logicalId, config) {
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[logicalId] = config
    }

    addOutput(logicalId, config) {
        this.serverless.service.provider.compiledCloudFormationTemplate.Outputs[logicalId] = config
    }

    async addResources() {
        const baseCacheBehaviours = StandardCacheBehaviours
        const cacheBehaviours = [
            {PathPattern: 'api/*', ...baseCacheBehaviours.serverFunction},
            {PathPattern: '_next/data/*', ...baseCacheBehaviours.serverFunction},
            {PathPattern: '_next/image*', ...baseCacheBehaviours.imageFunction},
        ]
        const files = await readdir('.open-next/assets', { withFileTypes: true });
        for (const file of files) {
            if (file.isFile() || file.isDirectory()) {
                cacheBehaviours.push({
                    PathPattern: file.name + (file.isDirectory() ? '/*' : ''),
                    ...baseCacheBehaviours.staticFiles
                })
            }
        }
        this.addResource('ImageFunctionRole', {
            Type: 'AWS::IAM::Role',
            Properties: {
                AssumeRolePolicyDocument: {
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Effect: "Allow",
                            Principal: {
                                Service: ["lambda.amazonaws.com"]
                            },
                            Action: ["sts:AssumeRole"]
                        }
                    ]
                },
                Path: "/",
                RoleName: {
                    "Fn::Sub": "${AWS::StackName}-${AWS::Region}-image-role"
                },
                Policies: [{
                    PolicyName: {
                        "Fn::Sub": "${AWS::StackName}-image-lambda"
                    },
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogStream',
                                'logs:CreateLogGroup',
                                'logs:TagResource',
                            ],
                            Resource: [{
                                'Fn::Sub': "${ImageLogGroup.Arn}"
                            }]
                        }, {
                            Effect: 'Allow',
                            Action: [
                                'logs:PutLogEvents',
                            ],
                            Resource: [{
                                'Fn::Sub': "${ImageLogGroup.Arn}:*"
                            }]
                        }, {
                            Effect: 'Allow',
                            Action: [
                                's3:getObject',
                            ],
                            Resource: [{
                                'Fn::Sub': "${SiteBucket.Arn}/*"
                            }]
                        }]
                    }
                }],
            },
        })
        this.addResource('SiteBucket', {
            Type: 'AWS::S3::Bucket',
            Properties: StandardSiteBucket,
        })
        this.addResource('SiteBucketPolicy', {
            Type: 'AWS::S3::BucketPolicy',
            Properties: StandardSiteBucketPolicy,
        })
        this.addResource('OriginAccessControl', {
            Type: 'AWS::CloudFront::OriginAccessControl',
            Properties: {
                OriginAccessControlConfig: {
                    "Description" : {
                        'Fn::Sub': "Used by ${AWS::StackName}-${AWS::Region}"
                    },
                    "Name" : {
                        'Fn::Sub': "${AWS::StackName}-${AWS::Region}"
                    },
                    "OriginAccessControlOriginType" : 's3',
                    "SigningBehavior" : 'always',
                    "SigningProtocol" : 'sigv4',
                }
            },
        })
        this.addResource('HostHeaderFunction', {
            Type: 'AWS::CloudFront::Function',
            Properties: {
                AutoPublish: true,
                FunctionCode: 'function handler(event) { var request = event.request; request.headers["x-forwarded-host"] = request.headers.host; return request; }',
                FunctionConfig: {
                    Comment: 'Forward host header',
                    Runtime: 'cloudfront-js-2.0',
                },
                Name: { 'Fn::Sub': "${AWS::StackName}-${AWS::Region}-host" }
            }
        })
        this.addResource('ServerCachePolicy', {
            Type: 'AWS::CloudFront::CachePolicy',
            Properties: {
                CachePolicyConfig: {
                    Name: { 'Fn::Sub': "${AWS::StackName}-${AWS::Region}-server-cache" },
                    Comment: 'Cache policy for Next.js server function',
                    MinTTL: 0,
                    MaxTTL: 31536000,
                    DefaultTTL: 0,
                    ParametersInCacheKeyAndForwardedToOrigin: {
                        CookiesConfig: {
                            CookieBehavior: 'none'
                        },
                        EnableAcceptEncodingBrotli: true,
                        EnableAcceptEncodingGzip: true,
                        HeadersConfig: {
                            HeaderBehavior: 'whitelist',
                            Headers: ['next-url', 'rsc', 'next-router-prefetch', 'next-router-state-tree', 'accept'],
                        },
                        QueryStringsConfig: {
                            QueryStringBehavior: 'all'
                        },
                    }
                },
            }
        })
        this.addResource('CloudFrontDistribution', {
            Type: 'AWS::CloudFront::Distribution',
            Properties: {
                DistributionConfig: {
                    Enabled: true,
                    HttpVersion: 'http2and3',
                    PriceClass: 'PriceClass_100',
                    IPV6Enabled: true,
                    Origins: [
                        StandardOrigins.serverFunction,
                        StandardOrigins.imageFunction,
                        StandardOrigins.staticFiles,
                    ],
                    DefaultCacheBehavior: baseCacheBehaviours.serverFunction,
                    CacheBehaviors: cacheBehaviours,
                }
            },
        })
        this.addOutput('CloudFrontDomain', {
            Description: 'URL of the CloudFront distribution',
            Value: { 'Fn::GetAtt': ['CloudFrontDistribution', 'DomainName'] }
        })
        this.addOutput('SiteURL', {
            Description: 'URL of the CloudFront distribution',
            Value: { 'Fn::Sub': "https://${CloudFrontDistribution.DomainName}" }
        })
        this.addOutput('SiteBucketName', {
            Description: 'Name of the site bucket',
            Value: { Ref: 'SiteBucket' }
        })
    }
}