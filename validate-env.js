#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple .env.test validation script
console.log('🔍 Validating .env.test file...');
console.log('================================');

// Check if .env.test exists
const envTestPath = path.join(__dirname, '.env.test');
if (!fs.existsSync(envTestPath)) {
    console.log('❌ .env.test file not found!');
    console.log('Run: cp .env.copy .env.test');
    process.exit(1);
}

// Read and parse .env.test
const envContent = fs.readFileSync(envTestPath, 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
        }
    }
});

let valid = true;
const warnings = [];
const errors = [];
const info = [];

// Validation functions
function validatePrivateKey() {
    const privateKey = envVars.PRIVATE_KEY;
    if (!privateKey) {
        errors.push('❌ PRIVATE_KEY is empty');
        valid = false;
    } else if (privateKey.includes('"') || privateKey.includes('[')) {
        info.push('✅ PRIVATE_KEY is set (array format detected)');
    } else {
        info.push('✅ PRIVATE_KEY is set');
    }
}

function validateNetwork() {
    const rpcEndpoint = envVars.RPC_ENDPOINT;
    const wsEndpoint = envVars.RPC_WEBSOCKET_ENDPOINT;

    if (rpcEndpoint && rpcEndpoint.includes('devnet')) {
        info.push('✅ Using DEVNET (safe for testing)');
    } else if (rpcEndpoint && rpcEndpoint.includes('mainnet')) {
        errors.push('❌ Using MAINNET - DANGEROUS for testing!');
        valid = false;
    } else {
        warnings.push(`⚠️ Unknown network: ${rpcEndpoint}`);
    }

    if (wsEndpoint && wsEndpoint.includes('devnet')) {
        info.push('✅ WebSocket using DEVNET');
    } else if (wsEndpoint && wsEndpoint.includes('mainnet')) {
        errors.push('❌ WebSocket using MAINNET - DANGEROUS!');
        valid = false;
    }
}

function validateTradeSettings() {
    const quoteAmount = parseFloat(envVars.QUOTE_AMOUNT || '0');
    const buySlippage = parseFloat(envVars.BUY_SLIPPAGE || '0');
    const sellSlippage = parseFloat(envVars.SELL_SLIPPAGE || '0');
    const takeProfit = parseFloat(envVars.TAKE_PROFIT || '0');
    const stopLoss = parseFloat(envVars.STOP_LOSS || '0');

    // Quote amount validation
    if (quoteAmount > 0.01) {
        warnings.push(`⚠️ QUOTE_AMOUNT (${quoteAmount}) is high for testing`);
    } else if (quoteAmount < 0.00001) {
        warnings.push(`⚠️ QUOTE_AMOUNT (${quoteAmount}) might be too small`);
    } else {
        info.push(`✅ QUOTE_AMOUNT (${quoteAmount}) is reasonable for testing`);
    }

    // Slippage validation
    if (buySlippage > 30) {
        warnings.push(`⚠️ BUY_SLIPPAGE (${buySlippage}%) is very high`);
    } else if (buySlippage < 1) {
        warnings.push(`⚠️ BUY_SLIPPAGE (${buySlippage}%) might be too low`);
    } else {
        info.push(`✅ BUY_SLIPPAGE (${buySlippage}%) is reasonable`);
    }

    if (sellSlippage > 30) {
        warnings.push(`⚠️ SELL_SLIPPAGE (${sellSlippage}%) is very high`);
    } else if (sellSlippage < 1) {
        warnings.push(`⚠️ SELL_SLIPPAGE (${sellSlippage}%) might be too low`);
    } else {
        info.push(`✅ SELL_SLIPPAGE (${sellSlippage}%) is reasonable`);
    }

    // Profit/Loss validation
    if (takeProfit < 10) {
        warnings.push(`⚠️ TAKE_PROFIT (${takeProfit}%) is quite low`);
    } else if (takeProfit > 200) {
        warnings.push(`⚠️ TAKE_PROFIT (${takeProfit}%) is very high`);
    } else {
        info.push(`✅ TAKE_PROFIT (${takeProfit}%) is reasonable`);
    }

    if (stopLoss < 5) {
        warnings.push(`⚠️ STOP_LOSS (${stopLoss}%) is quite low`);
    } else if (stopLoss > 50) {
        warnings.push(`⚠️ STOP_LOSS (${stopLoss}%) is very high`);
    } else {
        info.push(`✅ STOP_LOSS (${stopLoss}%) is reasonable`);
    }

    // Transaction executor
    const txExecutor = envVars.TRANSACTION_EXECUTOR;
    const customFee = envVars.CUSTOM_FEE;

    if (txExecutor === 'default') {
        info.push('✅ Using default executor (cheapest for testing)');
    } else if (txExecutor === 'warp' || txExecutor === 'jito') {
        warnings.push(`⚠️ Using ${txExecutor} executor - will charge ${customFee} SOL per transaction`);
    }
}

function validateSafetySettings() {
    const checkBurned = envVars.CHECK_IF_BURNED === 'true';
    const checkRenounced = envVars.CHECK_IF_MINT_IS_RENOUNCED === 'true';
    const checkSocials = envVars.CHECK_IF_SOCIALS === 'true';

    if (checkBurned) {
        info.push('✅ Checking if liquidity is burned (good for safety)');
    } else {
        warnings.push('⚠️ Not checking if liquidity is burned - risky!');
    }

    if (checkRenounced) {
        info.push('✅ Checking if mint is renounced (good for safety)');
    } else {
        warnings.push('⚠️ Not checking if mint is renounced - risky!');
    }

    if (checkSocials) {
        info.push('✅ Checking for social links (good for legitimacy)');
    }
}

// Run all validations
validatePrivateKey();
validateNetwork();
validateTradeSettings();
validateSafetySettings();

// Print results
info.forEach(msg => console.log(msg));

if (warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    warnings.forEach(msg => console.log(`  ${msg}`));
}

if (errors.length > 0) {
    console.log('\n❌ ERRORS:');
    errors.forEach(msg => console.log(`  ${msg}`));
}

console.log('\n================================');

if (valid) {
    console.log('✅ Validation passed! Your .env.test is ready for dry run.');
    console.log('\n📋 Next steps:');
    console.log('1. Make sure you have devnet SOL in your wallet');
    console.log('2. Run: npm run paper-trade');
    console.log('3. Monitor the results and adjust parameters');
    console.log('\n🔧 To get devnet SOL:');
    console.log('   • Visit: https://faucet.solana.com/');
    console.log('   • Or use: solana airdrop 2 <your-wallet-address> --url devnet');
} else {
    console.log('❌ Validation failed! Please fix the errors above.');
    process.exit(1);
}
