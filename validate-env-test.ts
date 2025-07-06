import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { getWallet } from './helpers/wallet';
import { getToken } from './helpers/token';
import { Connection, PublicKey } from '@solana/web3.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

export class EnvTestValidator {
  private result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: []
  };

  async validate(envPath: string = '.env.test'): Promise<ValidationResult> {
    console.log('🔍 Validating .env.test file...');
    console.log('================================');

    // Check if file exists
    if (!fs.existsSync(envPath)) {
      this.result.errors.push('❌ .env.test file not found!');
      this.result.valid = false;
      return this.result;
    }

    // Load environment variables
    config({ path: envPath });

    // Run all validations
    this.validatePrivateKey();
    this.validateNetwork();
    this.validateTradeSettings();
    this.validateSafetySettings();
    this.validateWalletFunds();

    // Print results
    this.printResults();

    return this.result;
  }

  private validatePrivateKey() {
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      this.result.errors.push('❌ PRIVATE_KEY is empty');
      this.result.valid = false;
      return;
    }

    try {
      const wallet = getWallet(privateKey);
      this.result.info.push(`✅ PRIVATE_KEY is valid`);
      this.result.info.push(`   Wallet Address: ${wallet.publicKey.toString()}`);
    } catch (error) {
      this.result.errors.push(`❌ PRIVATE_KEY is invalid: ${error}`);
      this.result.valid = false;
    }
  }

  private validateNetwork() {
    const rpcEndpoint = process.env.RPC_ENDPOINT;
    const wsEndpoint = process.env.RPC_WEBSOCKET_ENDPOINT;

    if (rpcEndpoint?.includes('devnet')) {
      this.result.info.push('✅ Using DEVNET (safe for testing)');
    } else if (rpcEndpoint?.includes('mainnet')) {
      this.result.errors.push('❌ Using MAINNET - DANGEROUS for testing!');
      this.result.valid = false;
    } else {
      this.result.warnings.push(`⚠️ Unknown network: ${rpcEndpoint}`);
    }

    if (wsEndpoint?.includes('devnet')) {
      this.result.info.push('✅ WebSocket using DEVNET');
    } else if (wsEndpoint?.includes('mainnet')) {
      this.result.errors.push('❌ WebSocket using MAINNET - DANGEROUS!');
      this.result.valid = false;
    }
  }

  private validateTradeSettings() {
    const quoteAmount = parseFloat(process.env.QUOTE_AMOUNT || '0');
    const buySlippage = parseFloat(process.env.BUY_SLIPPAGE || '0');
    const sellSlippage = parseFloat(process.env.SELL_SLIPPAGE || '0');
    const takeProfit = parseFloat(process.env.TAKE_PROFIT || '0');
    const stopLoss = parseFloat(process.env.STOP_LOSS || '0');

    // Quote amount validation
    if (quoteAmount > 0.01) {
      this.result.warnings.push(`⚠️ QUOTE_AMOUNT (${quoteAmount}) is high for testing`);
    } else if (quoteAmount < 0.00001) {
      this.result.warnings.push(`⚠️ QUOTE_AMOUNT (${quoteAmount}) might be too small`);
    } else {
      this.result.info.push(`✅ QUOTE_AMOUNT (${quoteAmount}) is reasonable for testing`);
    }

    // Slippage validation
    if (buySlippage > 30) {
      this.result.warnings.push(`⚠️ BUY_SLIPPAGE (${buySlippage}%) is very high`);
    } else if (buySlippage < 1) {
      this.result.warnings.push(`⚠️ BUY_SLIPPAGE (${buySlippage}%) might be too low`);
    } else {
      this.result.info.push(`✅ BUY_SLIPPAGE (${buySlippage}%) is reasonable`);
    }

    if (sellSlippage > 30) {
      this.result.warnings.push(`⚠️ SELL_SLIPPAGE (${sellSlippage}%) is very high`);
    } else if (sellSlippage < 1) {
      this.result.warnings.push(`⚠️ SELL_SLIPPAGE (${sellSlippage}%) might be too low`);
    } else {
      this.result.info.push(`✅ SELL_SLIPPAGE (${sellSlippage}%) is reasonable`);
    }

    // Profit/Loss validation
    if (takeProfit < 10) {
      this.result.warnings.push(`⚠️ TAKE_PROFIT (${takeProfit}%) is quite low`);
    } else if (takeProfit > 200) {
      this.result.warnings.push(`⚠️ TAKE_PROFIT (${takeProfit}%) is very high`);
    } else {
      this.result.info.push(`✅ TAKE_PROFIT (${takeProfit}%) is reasonable`);
    }

    if (stopLoss < 5) {
      this.result.warnings.push(`⚠️ STOP_LOSS (${stopLoss}%) is quite low`);
    } else if (stopLoss > 50) {
      this.result.warnings.push(`⚠️ STOP_LOSS (${stopLoss}%) is very high`);
    } else {
      this.result.info.push(`✅ STOP_LOSS (${stopLoss}%) is reasonable`);
    }

    // Transaction executor
    const txExecutor = process.env.TRANSACTION_EXECUTOR;
    const customFee = process.env.CUSTOM_FEE;

    if (txExecutor === 'default') {
      this.result.info.push('✅ Using default executor (cheapest for testing)');
    } else if (txExecutor === 'warp' || txExecutor === 'jito') {
      this.result.warnings.push(`⚠️ Using ${txExecutor} executor - will charge ${customFee} SOL per transaction`);
    }
  }

  private validateSafetySettings() {
    const checkBurned = process.env.CHECK_IF_BURNED === 'true';
    const checkRenounced = process.env.CHECK_IF_MINT_IS_RENOUNCED === 'true';
    const checkMutable = process.env.CHECK_IF_MUTABLE === 'true';
    const checkSocials = process.env.CHECK_IF_SOCIALS === 'true';

    if (checkBurned) {
      this.result.info.push('✅ Checking if liquidity is burned (good for safety)');
    } else {
      this.result.warnings.push('⚠️ Not checking if liquidity is burned - risky!');
    }

    if (checkRenounced) {
      this.result.info.push('✅ Checking if mint is renounced (good for safety)');
    } else {
      this.result.warnings.push('⚠️ Not checking if mint is renounced - risky!');
    }

    if (checkSocials) {
      this.result.info.push('✅ Checking for social links (good for legitimacy)');
    }
  }

  private async validateWalletFunds() {
    try {
      const privateKey = process.env.PRIVATE_KEY;
      const rpcEndpoint = process.env.RPC_ENDPOINT;
      
      if (!privateKey || !rpcEndpoint) return;

      const wallet = getWallet(privateKey);
      const connection = new Connection(rpcEndpoint);
      
      const balance = await connection.getBalance(wallet.publicKey);
      const solBalance = balance / 1e9; // Convert lamports to SOL

      if (solBalance < 0.01) {
        this.result.warnings.push(`⚠️ Low SOL balance: ${solBalance.toFixed(4)} SOL`);
        this.result.warnings.push('   Get devnet SOL from: https://faucet.solana.com/');
      } else {
        this.result.info.push(`✅ SOL balance: ${solBalance.toFixed(4)} SOL`);
      }
    } catch (error) {
      this.result.warnings.push(`⚠️ Could not check wallet balance: ${error}`);
    }
  }

  private printResults() {
    // Print info messages
    if (this.result.info.length > 0) {
      this.result.info.forEach(msg => console.log(msg));
    }

    // Print warnings
    if (this.result.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      this.result.warnings.forEach(msg => console.log(`  ${msg}`));
    }

    // Print errors
    if (this.result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.result.errors.forEach(msg => console.log(`  ${msg}`));
    }

    console.log('\n================================');

    if (this.result.valid) {
      console.log('✅ Validation passed! Your .env.test is ready for dry run.');
      console.log('\n📋 Next steps:');
      console.log('1. Make sure you have devnet SOL in your wallet');
      console.log('2. Run: npm run paper-trade');
      console.log('3. Monitor the results and adjust parameters');
    } else {
      console.log('❌ Validation failed! Please fix the errors above.');
    }
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  const validator = new EnvTestValidator();
  validator.validate('.env.test').then(result => {
    process.exit(result.valid ? 0 : 1);
  }).catch(error => {
    console.error('Validation error:', error);
    process.exit(1);
  });
}
