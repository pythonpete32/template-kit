# Dev Log

I have messed this up a few times already so I'm going to keep a log of what I've done to make debugging easier and to save time for anyone that has to help me if I screw it up again.

## 1. Add two tokens to the kit

This isn't as straight forward as I thought it was going to be. The planning suite kit uses a mapping `tokenCache` and two methods `cacheToken()` and `popToken()` it inherits from `BetaKitBase.sol`. these cant be reused and have a cascading effect of having to change a load of functions throughout the template. I'm not sure what is the best way to test this as I go, but I'm going to

1. create the new cache and methods
2. start by modifying the functions called at the top of the stack card coding values
3. repeat working my way to the bottom of the stack of functions 
4. removing the hard coding

### Questions

- to set up the repo for development locally, first `npm i` in the root directory, them `npm run bootstrap` and I should be good to go?
- why can't I run truffle compile with the correct version of solc? the `truffle-config.js` references another @tps version `'@tps/test-helpers/truffle-config'`, there is no @tps folder in the `/kits/planning-suite` directory or subfolders. maybe there is another way I should be compiling?
- so after adding the correct solc version to `truffle-config` won't compile because solc cant find the roles. Is this because the template is refrencing the proxy onchain? if so what is the workflow for doing this? how do I compile my template as I'm developing it? and can I just do this with the TPS apps, like start with a fresh project and use the TPS proxies?

### A. 

- created: struct tokensCache
- created: function cacheTokens()
- created: event DeployTokens()