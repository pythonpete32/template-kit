require('dotenv').config({ path: '../.env' })

const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const getBlock = require('@aragon/test-helpers/block')(web3)
//const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const getBalance = require('@aragon/test-helpers/balance')(web3)
const namehash = require('eth-ens-namehash').hash
const keccak256 = require('js-sha3').keccak_256

const {
  encodeCallScript,
  EMPTY_SCRIPT,
} = require('@aragon/test-helpers/evmScript')

const ENS = artifacts.require('ENS')
const PublicResolver = artifacts.require('PublicResolver')

const MiniMeToken = artifacts.require('MiniMeToken')

const Finance = artifacts.require('Finance')
const TokenManager = artifacts.require('TokenManager')
const Vault = artifacts.require('Vault')
const Voting = artifacts.require('Voting')
const AddressBook = artifacts.require('AddressBook')
const DotVoting = artifacts.require('DotVoting')
const Allocations = artifacts.require('Allocations')
const Projects = artifacts.require('Projects')

const apps = ['finance', 'token-manager', 'vault', 'voting']
const appIds = apps.map(app => namehash(`${app}.aragonpm.eth`))

const planningApps = [
  'address-book',
  'allocations',
  'projects',
  'dot-voting',
  'rewards',
]
const planningAppIds = planningApps.map(app => namehash(`${app}.aragonpm.eth`))

const getContract = name => artifacts.require(name)

const pct16 = x =>
  new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(16))
const getEventResult = (receipt, event, param) =>
  receipt.logs.filter(l => l.event == event)[0].args[param]
const getVoteId = receipt => {
  const logs = receipt.receipt.logs.filter(
    l => l.topics[0] == web3.sha3('StartVote(uint256,address,string)')
  )
  return web3.toDecimal(logs[0].topics[1])
}
const getAppProxy = (receipt, id) =>
  receipt.logs.filter(l => l.event == 'InstalledApp' && l.args.appId == id)[0]
    .args.appProxy
const networks = require('../truffle-config').networks
const getNetwork = require('../helpers/networks.js')
const getKitConfiguration = async networkName => {
  let arappFilename
  if (networkName == 'devnet' || networkName == 'rpc') {
    arappFilename = 'arapp_local'
  } else {
    arappFilename = 'arapp'
  }
  const arappFile = require('../' + arappFilename)
  //console.log(arappFile, networkName)
  const ensAddress = arappFile.environments[networkName].registry
  const ens = getContract('ENS').at(ensAddress)
  const kitEnsName = arappFile.environments[networkName].appName
  const repoAddr = await artifacts
    .require('PublicResolver')
    .at(await ens.resolver(namehash('aragonpm.eth')))
    .addr(namehash(kitEnsName))
  const repo = getContract('Repo').at(repoAddr)
  console.log('[getConfiguration] apm repo address:', repoAddr)
  const kitAddress = (await repo.getLatest())[1]
  const kitContractName = arappFile.path
    .split('/')
    .pop()
    .split('.sol')[0]
  const kit = getContract(kitContractName).at(kitAddress)
  return { ens, kit }
}

contract('Planning Suite', accounts => {
  const ETH = '0x0'
  let ens
  let daoAddress, tokenAddress

  let financeAddress, tokenManagerAddress, vaultAddress, votingAddress
  let finance, tokenManager, vault, voting

  let addressBookAddress,
    allocationsAddress,
    projectsAddress,
    dotVotingAddress,
    rewardsAddress
  let addressBook, allocations, projects, dotVoting, rewards

  let kit, receiptInstance

  const owner = accounts[0]
  const holder20 = accounts[1]
  const holder29 = accounts[2]
  const holder51 = accounts[3]
  const nonHolder = accounts[4]

  const neededSupport = pct16(50)
  const minimumAcceptanceQuorum = pct16(20)
  const minParticipationPct = pct16(50)
  const candidateSupportPct = pct16(10)
  const votingTime = 60

  before(async () => {
    // create Planning Suite Kit
    // console.log(networks)
    const networkName = (await getNetwork(networks)).name
    //if (networkName == 'devnet' || networkName == 'rpc') {
    //  // transfer some ETH to other accounts
    //  await web3.eth.sendTransaction({
    //    from: owner,
    //    to: holder20,
    //    value: web3.toWei(10, 'ether'),
    //  })
    //  await web3.eth.sendTransaction({
    //    from: owner,
    //    to: holder29,
    //    value: web3.toWei(10, 'ether'),
    //  })
    //  await web3.eth.sendTransaction({
    //    from: owner,
    //    to: holder51,
    //    value: web3.toWei(10, 'ether'),
    //  })
    //  await web3.eth.sendTransaction({
    //    from: owner,
    //    to: nonHolder,
    //    value: web3.toWei(10, 'ether'),
    //  })
    //}
    const configuration = await getKitConfiguration(networkName)
    ens = configuration.ens
    kit = configuration.kit
  })

  // Test when organization is created in one call with `newTokenAndInstance()` and in
  // two calls with `newToken()` and `newInstance()`
  // const creationStyles = ['single', 'separate']
  const creationStyles = ['separate']
  for (const creationStyle of creationStyles) {
    context(`> Creation through ${creationStyle} transaction`, () => {
      let aragonId, tokenName, tokenSymbol

      before(async () => {
        aragonId = 'planning-suite-dao-' + Math.floor(Math.random() * 1000)
        tokenName = 'AutarkToken'
        tokenSymbol = 'autark'

        const holders = [owner, holder29, holder51]
        const stakes = [20e18, 29e18, 51e18]

        if (creationStyle === 'single') {
          // create token and instance
          receiptInstance = await kit.newTokenAndInstance(
            tokenName,
            tokenSymbol,
            aragonId,
            holders,
            stakes,
            neededSupport,
            minimumAcceptanceQuorum,
            votingTime
          )
          tokenAddress = getEventResult(receiptInstance, 'DeployToken', 'token')
          daoAddress = getEventResult(receiptInstance, 'DeployInstance', 'dao')
        } else if (creationStyle === 'separate') {
          // create Token
          const receiptToken = await kit.newToken(tokenName, tokenSymbol)
          console.log('got here')
          // console.log(accounts)
          tokenAddress = getEventResult(receiptToken, 'DeployToken', 'token')

          console.log('Creating instance:', {
            aragonId,
            holders,
            stakes,
            candidateSupportPct,
            minimumAcceptanceQuorum,
            votingTime,
            owner,
          })

          // create Instance
          receiptInstance = await kit.newInstance(
            aragonId,
            holders,
            stakes,
            neededSupport,
            minimumAcceptanceQuorum,
            votingTime,
            { from: owner }
          )
        }
        // generated apps from dao creation
        financeAddress = getAppProxy(receiptInstance, appIds[0])
        finance = await Finance.at(financeAddress)
        tokenManagerAddress = getAppProxy(receiptInstance, appIds[1])
        tokenManager = TokenManager.at(tokenManagerAddress)
        votingAddress = getAppProxy(receiptInstance, appIds[3])
        voting = Voting.at(votingAddress)
        daoAddress = getEventResult(receiptInstance, 'DeployInstance', 'dao')
        vaultAddress = getEventResult(
          receiptInstance,
          'DeployInstance',
          'vault'
        )
        votingAddress = getEventResult(
          receiptInstance,
          'DeployInstance',
          'voting'
        )
        tokenAddress = getEventResult(
          receiptInstance,
          'DeployInstance',
          'token'
        )
        console.log('Dao Created', daoAddress)
        // Add PlanningSuite Apps to DAO
        receiptInstance = await kit.newPlanningApps(
          daoAddress,
          vaultAddress,
          votingAddress,
          tokenAddress,
          candidateSupportPct,
          minParticipationPct,
          votingTime
        )
        // generated apps from TPS
        vaultAddress = getAppProxy(receiptInstance, appIds[2])
        vault = await Vault.at(vaultAddress)
        addressBookAddress = getAppProxy(receiptInstance, planningAppIds[0])
        addressBook = await AddressBook.at(addressBookAddress)
        allocationsAddress = getAppProxy(receiptInstance, planningAppIds[1])
        allocations = Allocations.at(allocationsAddress)
        projectsAddress = getAppProxy(receiptInstance, planningAppIds[2])
        projects = await Projects.at(projectsAddress)
        dotVotingAddress = getAppProxy(receiptInstance, planningAppIds[3])
        dotVoting = DotVoting.at(dotVotingAddress)
      })

      it('creates and initializes a DAO with its Token', async () => {
        assert.notEqual(tokenAddress, '0x0', 'Token not generated')
        assert.notEqual(tokenAddress, undefined, 'Token undefined')

        assert.notEqual(daoAddress, '0x0', 'Instance not generated')
        assert.notEqual(daoAddress, undefined, 'Instance undefined')

        // Check ENS assignment
        // const aragonIdNamehash = namehash(`${aragonId}.aragonid.eth`)
        // const resolvedAddr = await PublicResolver.at(
        //   await ens.resolver(aragonIdNamehash)
        // ).addr(aragonIdNamehash)
        // assert.equal(
        //   resolvedAddr,
        //   daoAddress,
        //   "aragonId ENS name doesn't match"
        // )

        // Check token values
        const token = MiniMeToken.at(tokenAddress)
        assert.equal(await token.name(), tokenName, "token name doesn't match")
        assert.equal(
          await token.symbol(),
          tokenSymbol,
          "token symbol doesn't match"
        )
      })

      it('has initialized all apps', async () => {
        assert.isTrue(await finance.hasInitialized(), 'finance not initialized')
        assert.isTrue(
          await tokenManager.hasInitialized(),
          'tokenManager not initialized'
        )
        assert.isTrue(await vault.hasInitialized(), 'vault not initialized')
        assert.isTrue(await voting.hasInitialized(), 'voting not initialized')
      })

      it('has correct permissions', async () => {
        const dao = await getContract('Kernel').at(daoAddress)
        const acl = await getContract('ACL').at(await dao.acl())

        const checkRole = async (
          appAddress,
          permission,
          managerAddress,
          appName = '',
          roleName = '',
          granteeAddress = managerAddress
        ) => {
          assert.equal(
            await acl.getPermissionManager(appAddress, permission),
            managerAddress,
            `${appName} ${roleName} Manager should match`
          )
          assert.isTrue(
            await acl.hasPermission(granteeAddress, appAddress, permission),
            `Grantee should have ${appName} role ${roleName}`
          )
        }

        // app manager role
        await checkRole(
          daoAddress,
          await dao.APP_MANAGER_ROLE(),
          votingAddress,
          'Kernel',
          'APP_MANAGER'
        )

        // create permissions role
        await checkRole(
          acl.address,
          await acl.CREATE_PERMISSIONS_ROLE(),
          votingAddress,
          'ACL',
          'CREATE_PERMISSION'
        )

        // evm script registry
        const regConstants = await getContract(
          'EVMScriptRegistryConstants'
        ).new()
        const reg = await getContract('EVMScriptRegistry').at(
          await acl.getEVMScriptRegistry()
        )
        await checkRole(
          reg.address,
          await reg.REGISTRY_ADD_EXECUTOR_ROLE(),
          votingAddress,
          'EVMScriptRegistry',
          'ADD_EXECUTOR'
        )
        await checkRole(
          reg.address,
          await reg.REGISTRY_MANAGER_ROLE(),
          votingAddress,
          'EVMScriptRegistry',
          'REGISTRY_MANAGER'
        )

        // voting
        await checkRole(
          votingAddress,
          await voting.ROLE_CREATE_VOTES(),
          votingAddress,
          'Voting',
          'CREATE_VOTES',
          tokenManagerAddress
        )
        await checkRole(
          votingAddress,
          await voting.ROLE_MODIFY_QUORUM_ROLE(),
          votingAddress,
          'Voting',
          'ROLE_MODIFY_QUORUM'
        )
        assert.equal(
          await acl.getPermissionManager(
            votingAddress,
            await voting.MODIFY_SUPPORT_ROLE()
          ),
          await acl.BURN_ENTITY(),
          'Voting MODIFY_SUPPORT Manager should be burned'
        )

        // vault
        await checkRole(
          vaultAddress,
          await vault.TRANSFER_ROLE(),
          votingAddress,
          'Vault',
          'TRANSFER',
          financeAddress
        )

        // finance
        await checkRole(
          financeAddress,
          await finance.CREATE_PAYMENTS_ROLE(),
          votingAddress,
          'Finance',
          'CREATE_PAYMENTS'
        )
        await checkRole(
          financeAddress,
          await finance.EXECUTE_PAYMENTS_ROLE(),
          votingAddress,
          'Finance',
          'EXECUTE_PAYMENTS'
        )
        await checkRole(
          financeAddress,
          await finance.MANAGE_PAYMENTS_ROLE(),
          votingAddress,
          'Finance',
          'MANAGE_PAYMENTS'
        )

        // token manager
        await checkRole(
          tokenManagerAddress,
          await tokenManager.ASSIGN_ROLE(),
          votingAddress,
          'TokenManager',
          'ASSIGN'
        )
        await checkRole(
          tokenManagerAddress,
          await tokenManager.REVOKE_VESTINGS_ROLE(),
          votingAddress,
          'TokenManager',
          'REVOKE_VESTINGS'
        )
      })

      it("fails creating a DAO if holders and stakes don't match", async () => {
        const aragonId = 'bad-planning-suite-dao'
        const tokenName = 'BadAutarkToken'
        const tokenSymbol = 'BDT'
        const holders = [holder20, holder29, holder51]
        const stakes = [20e18, 29e18]

        if (creationStyle === 'single') {
          try {
            await kit.newTokenAndInstance(
              tokenName,
              tokenSymbol,
              aragonId,
              holders,
              stakes,
              neededSupport,
              minimumAcceptanceQuorum,
              votingTime
            )
          } catch (err) {
            assert.equal(err.receipt.status, 0, 'It should have thrown')
            return
          }
        } else if (creationStyle === 'separate') {
          // create Token
          await kit.newToken(tokenName, tokenSymbol)
          // create Instance
          try {
            await kit.newInstance(
              aragonId,
              holders,
              stakes,
              neededSupport,
              minimumAcceptanceQuorum,
              votingTime
            )
          } catch (err) {
            assert.equal(err.receipt.status, 0, 'It should have thrown')
            return
          }
        }
        assert.isFalse(true, 'It should have thrown')
      })

      xcontext('> Vote access', () => {
        it('set up voting correctly', async () => {
          assert.equal(
            (await voting.supportRequiredPct()).toString(),
            neededSupport.toString(),
            'support required not correct'
          )
          assert.equal(
            (await voting.minAcceptQuorumPct()).toString(),
            minimumAcceptanceQuorum.toString(),
            'accept quorum not correct'
          )
          assert.equal(
            (await voting.voteTime()).toString(),
            votingTime.toString(),
            'voting time not correct'
          )
        })

        it('cannot reinitialize voting', async () => {
          // check that it's initialized and can not be initialized again
          try {
            await voting.initialize(
              tokenAddress,
              neededSupport,
              minimumAcceptanceQuorum,
              votingTime
            )
          } catch (err) {
            assert.equal(err.receipt.status, 0, 'It should have thrown')
            return
          }
          assert.isFalse(true, 'It should have thrown')
        })

        it('fails trying to modify support threshold', async () => {
          try {
            await voting.changeSupportRequiredPct(neededSupport.add(1))
          } catch (err) {
            assert.equal(err.receipt.status, 0, 'It should have thrown')
            return
          }
          assert.isFalse(true, 'It should have thrown')
        })

        context('> Creating vote', () => {
          let voteId
          let executionTarget, script

          beforeEach(async () => {
            executionTarget = await getContract('ExecutionTarget').new()
            const action = {
              to: executionTarget.address,
              calldata: executionTarget.contract.execute.getData(),
            }
            script = encodeCallScript([action])
            const action2 = {
              to: voting.address,
              calldata: voting.contract.newVote.getData(script, 'metadata'),
            }
            const script2 = encodeCallScript([action2])
            const r = await tokenManager.forward(script2, { from: holder20 })
            voteId = getVoteId(r)
          })

          it('has correct state', async () => {
            const [
              isOpen,
              isExecuted,
              startDate,
              snapshotBlock,
              requiredSupport,
              minQuorum,
              y,
              n,
              totalVoters,
              execScript,
            ] = await voting.getVote(voteId)

            assert.isTrue(isOpen, 'vote should be open')
            assert.isFalse(isExecuted, 'vote should be executed')
            assert.equal(
              snapshotBlock.toString(),
              (await getBlockNumber()) - 1,
              'snapshot block should be correct'
            )
            assert.equal(
              requiredSupport.toString(),
              neededSupport.toString(),
              'min quorum should be app min quorum'
            )
            assert.equal(
              minQuorum.toString(),
              minimumAcceptanceQuorum.toString(),
              'min quorum should be app min quorum'
            )
            assert.equal(y, 0, 'initial yea should be 0')
            assert.equal(n, 0, 'initial nay should be 0')
            assert.equal(
              totalVoters.toString(),
              new web3.BigNumber(100e18).toString(),
              'total voters should be 100'
            )
            assert.equal(execScript, script, 'script should be correct')
          })

          it('holder can vote', async () => {
            await voting.vote(voteId, false, true, { from: holder29 })
            const state = await voting.getVote(voteId)

            assert.equal(
              state[7].toString(),
              new web3.BigNumber(29e18).toString(),
              'nay vote should have been counted'
            )
          })

          it('holder can modify vote', async () => {
            await voting.vote(voteId, true, true, { from: holder29 })
            await voting.vote(voteId, false, true, { from: holder29 })
            await voting.vote(voteId, true, true, { from: holder29 })
            const state = await voting.getVote(voteId)

            assert.equal(
              state[6].toString(),
              new web3.BigNumber(29e18).toString(),
              'yea vote should have been counted'
            )
            assert.equal(state[7], 0, 'nay vote should have been removed')
          })

          it('throws when non-holder tries to create a vote directly', async () => {
            const action = {
              to: executionTarget.address,
              calldata: executionTarget.contract.execute.getData(),
            }
            script = encodeCallScript([action])
            try {
              await voting.newVote(script, 'metadata', { from: nonHolder })
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })

          it('throws when non-holder tries to create a vote thru token manager', async () => {
            const action = {
              to: executionTarget.address,
              calldata: executionTarget.contract.execute.getData(),
            }
            script = encodeCallScript([action])
            const action2 = {
              to: voting.address,
              calldata: voting.contract.newVote.getData(script, 'metadata'),
            }
            const script2 = encodeCallScript([action2])
            try {
              await tokenManager.forward(script2, { from: nonHolder })
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })

          it('throws when non-holder votes', async () => {
            try {
              await voting.vote(voteId, true, true, { from: nonHolder })
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })

          it('throws when voting after voting closes', async () => {
            //await timeTravel(votingTime + 1)
            await sleep(votingTime + 1)
            try {
              await voting.vote(voteId, true, true, { from: holder29 })
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })

          it('can execute if vote is approved with support and quorum', async () => {
            await voting.vote(voteId, true, true, { from: holder29 })
            await voting.vote(voteId, false, true, { from: holder20 })
            //await timeTravel(votingTime + 1)
            //console.log("Time: + " + (await getBlock(await getBlockNumber())).timestamp)
            await sleep(votingTime + 1)
            //console.log("Time: + " + (await getBlock(await getBlockNumber())).timestamp)
            await voting.executeVote(voteId, { from: owner })
            assert.equal(
              (await executionTarget.counter()).toString(),
              1,
              'should have executed result'
            )
          })

          it('cannot execute vote if not enough quorum met', async () => {
            await voting.vote(voteId, true, true, { from: holder20 })
            //await timeTravel(votingTime + 1)
            await sleep(votingTime + 1)
            try {
              await voting.executeVote(voteId, { from: owner })
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })

          it('cannot execute vote if not support met', async () => {
            await voting.vote(voteId, false, true, { from: holder29 })
            await voting.vote(voteId, false, true, { from: holder20 })
            //await timeTravel(votingTime + 1)
            await sleep(votingTime + 1)
            try {
              await voting.executeVote(voteId, { from: owner })
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })
        })

        context('> Finance access', () => {
          let voteId, script
          const payment = new web3.BigNumber(2e16)

          beforeEach(async () => {
            // Fund Finance
            await finance.sendTransaction({ value: payment, from: owner })
            const action = {
              to: financeAddress,
              calldata: finance.contract.newPayment.getData(
                ETH,
                nonHolder,
                payment,
                0,
                0,
                1,
                'voting payment'
              ),
            }
            script = encodeCallScript([action])
            const action2 = {
              to: voting.address,
              calldata: voting.contract.newVote.getData(script, 'metadata'),
            }
            const script2 = encodeCallScript([action2])
            const r = await tokenManager.forward(script2, { from: holder20 })
            voteId = getVoteId(r)
          })

          it('finance can not be accessed directly (without a vote)', async () => {
            try {
              await finance.newPayment(
                ETH,
                nonHolder,
                2e16,
                0,
                0,
                1,
                'voting payment'
              )
            } catch (err) {
              assert.equal(err.receipt.status, 0, 'It should have thrown')
              return
            }
            assert.isFalse(true, 'It should have thrown')
          })

          it('transfers funds if vote is approved', async () => {
            const receiverInitialBalance = await getBalance(nonHolder)
            //await logBalances(financeAddress, vaultAddress)
            await voting.vote(voteId, true, true, { from: holder29 })
            await voting.vote(voteId, false, true, { from: holder20 })
            //await timeTravel(votingTime + 1)
            await sleep(votingTime + 1)
            await voting.executeVote(voteId, { from: owner })
            //await logBalances(financeAddress, vaultAddress)
            assert.equal(
              (await getBalance(nonHolder)).toString(),
              receiverInitialBalance.plus(payment).toString(),
              "Receiver didn't get the payment"
            )
          })
        })
      })
    })
  }

  const logBalances = async (financeAddress, vaultAddress) => {
    console.log('Owner ETH: ' + (await getBalance(owner)))
    console.log('Finance ETH: ' + (await getBalance(financeAddress)))
    console.log('Vault ETH: ' + (await getBalance(vaultAddress)))
    console.log('Receiver ETH: ' + (await getBalance(nonHolder)))
    console.log('-----------------')
  }

  const sleep = function(s) {
    return new Promise(resolve => setTimeout(resolve, s * 1000))
  }
})
