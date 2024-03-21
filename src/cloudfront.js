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
    },
    staticFiles: {
        AllowedMethods: HttpMethods.Read,
        CachedMethods: HttpMethods.Read,
        CachePolicyId: CachePolicies.CachingOptimized,
        OriginRequestPolicyId: OriginRequestPolicies.CORS_S3Origin,
        TargetOriginId: 'StaticFiles',
        ViewerProtocolPolicy: 'redirect-to-https',
    }
}