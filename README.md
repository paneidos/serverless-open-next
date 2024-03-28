# Serverless OpenNext

Use [Serverless](https://serverless.com) and [OpenNext](https://open-next.js.org) to deploy your Next.js app to AWS.

# Installation

Add this package to your Next.js project, along with Serverless
```
yarn add -D serverless-open-next serverless
# OR
npm install --save-dev serverless-open-next serverless
```

Create a `serverless.yml` file with at least the bare minimum:
```yaml
frameworkVersion: "^3"
service: my-next-app
provider:
  name: aws
  region: eu-central-1
  runtime: nodejs20.x
plugins:
  - serverless-open-next
```

Deploy using
```
yarn exec serverless deploy --stage dev
# OR
npm exec -- serverless deploy --stage dev
```

# Architecture

This package will deploy several resources to your AWS account,
which for small projects should all fall in the free tier.

- S3 bucket for assets
- Lambda for the server part
- Lambda with custom role for image optimisation
- IAM policy to allow server part access to S3
- CloudFront distribution

# Features

- SSR
- SSG
- API routes
- Middleware
- Image Optimization
- Fonts

# Roadmap

- ISR with proper cache
- Revalidation function
- Warmer function
- Customisation of functions/resources

# Acknowledgments

This project is built on these awesome projects:

- [Serverless Framework](https://serverless.com)
- [OpenNext](https://open-next.js.org)
- [Next.js](https://nextjs.org)
