export const CachePolicies = {
    CachingDisabled: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
    CachingOptimized: '658327ea-f89d-4fab-a63d-7e88639e58f6',
}

export const OriginRequestPolicies = {
    AllViewerExceptHostHeader: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
    CORS_S3Origin: '88a5eaf4-2fd4-4709-b370-b4c650ea3fcf'
}

export const HttpMethods = {
    Read: ['GET', 'HEAD', 'OPTIONS'],
    ReadWrite: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']
}

export const StandardCacheBehaviours = {
    serverFunction: {
        AllowedMethods: HttpMethods.ReadWrite,
        CachedMethods: HttpMethods.Read,
        CachePolicyId: CachePolicies.CachingDisabled,
        OriginRequestPolicyId: OriginRequestPolicies.AllViewerExceptHostHeader,
        TargetOriginId: 'ServerFunction',
        ViewerProtocolPolicy: 'redirect-to-https',
        FunctionAssociations: [{
            EventType: 'viewer-request',
            FunctionARN: { 'Fn::GetAtt': ['HostHeaderFunction', 'FunctionMetadata.FunctionARN'] }
        }],
    },
    imageFunction: {
        AllowedMethods: HttpMethods.ReadWrite,
        CachedMethods: HttpMethods.Read,
        CachePolicyId: CachePolicies.CachingDisabled,
        OriginRequestPolicyId: OriginRequestPolicies.AllViewerExceptHostHeader,
        TargetOriginId: 'ImageFunction',
        ViewerProtocolPolicy: 'redirect-to-https',
        FunctionAssociations: [{
            EventType: 'viewer-request',
            FunctionARN: { 'Fn::GetAtt': ['HostHeaderFunction', 'FunctionMetadata.FunctionARN'] }
        }],
    },
    staticFiles: {
        AllowedMethods: HttpMethods.Read,
        CachedMethods: HttpMethods.Read,
        CachePolicyId: CachePolicies.CachingOptimized,
        TargetOriginId: 'StaticFiles',
        ViewerProtocolPolicy: 'redirect-to-https',
    }
}

export const StandardOrigins = {
    imageFunction: {
        Id: 'ImageFunction',
        CustomOriginConfig: {
            OriginProtocolPolicy: 'https-only',
            OriginSSLProtocols: ['TLSv1.2']
        },
        DomainName: {
            'Fn::Select': [2, {'Fn::Split': ['/', {'Fn::GetAtt': ['ImageLambdaFunctionUrl', 'FunctionUrl']}]}]
        }
    },
    serverFunction: {
        Id: 'ServerFunction',
        CustomOriginConfig: {
            OriginProtocolPolicy: 'https-only',
            OriginSSLProtocols: ['TLSv1.2']
        },
        DomainName: {
            'Fn::Select': [2, {'Fn::Split': ['/', {'Fn::GetAtt': ['ServerLambdaFunctionUrl', 'FunctionUrl']}]}]
        }
    },
    staticFiles: {
        Id: 'StaticFiles',
        OriginAccessControlId: {
            'Fn::GetAtt': ['OriginAccessControl', 'Id'],
        },
        S3OriginConfig: {
            OriginAccessIdentity: '',
        },
        DomainName: {
            'Fn::GetAtt': ['SiteBucket', 'RegionalDomainName']
        },
        OriginPath: '/_assets',
    },
}