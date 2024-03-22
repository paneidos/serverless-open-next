export const StandardAssetsBucket = {
    BucketEncryption: {
        ServerSideEncryptionConfiguration: [{
            ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256'
            }
        }]
    }
}
export const StandardAssetsBucketPolicy = {
    Bucket: { Ref: 'AssetsBucket' },
    PolicyDocument: {
        Id: 'BucketPolicy',
        Version: '2012-10-17',
        Statement: [{
            Sid: 'PublicReadForCloudFront',
            Effect: 'Allow',
            Principal: {
                Service: 'cloudfront.amazonaws.com'
            },
            Action: 's3:GetObject',
            Resource: [{
                'Fn::Sub': '${AssetsBucket.Arn}/*'
            }],
            Condition: {
                StringEquals: {
                    'AWS:SourceArn': {
                        'Fn::Sub': 'arn:aws:cloudfront::${AWS::AccountId}:distribution/${CloudFrontDistribution}'
                    }
                }
            }
        }]
    }
}