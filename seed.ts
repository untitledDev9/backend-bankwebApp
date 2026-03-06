import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User';
import Account from './models/Account';
import Transaction from './models/Transaction';
import AuditLog from './models/AuditLog';

dotenv.config();

// Helper: random number between min and max (inclusive)
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper: pick random item from array
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

// Generate realistic transaction descriptions
const creditDescriptions = [
  'Salary — Direct Deposit',
  'Freelance payment — Web Development',
  'Transfer from savings',
  'Refund — Amazon',
  'Refund — Subscription cancel',
  'Payment received — Invoice #',
  'Cashback reward',
  'Interest earned',
  'Bonus — Performance',
  'Gift received',
  'Tax refund',
  'Insurance claim payout',
  'Dividend payment',
  'Rental income',
  'Commission payment',
];

const debitDescriptions = [
  'Grocery — Walmart',
  'Electricity bill',
  'Internet — Comcast',
  'Netflix subscription',
  'Spotify subscription',
  'Uber ride',
  'Restaurant — Olive Garden',
  'Gas station — Shell',
  'Amazon purchase',
  'Phone bill — AT&T',
  'Rent payment',
  'Insurance premium',
  'Gym membership — Planet Fitness',
  'Coffee — Starbucks',
  'Pharmacy — CVS',
  'Clothing — Zara',
  'Water bill',
  'Car payment',
  'Student loan payment',
  'Withdrawal — ATM',
  'Transfer to savings',
  'Medical — Copay',
  'Dentist appointment',
  'Home repair — Plumbing',
  'Haircut — Barber shop',
  'Dry cleaning',
  'Pet supplies — PetSmart',
  'Parking fee',
  'Flight — Delta Airlines',
  'Hotel — Marriott',
];

const transferDescriptions = [
  'Transfer to HTB-2024-10002 — Rent share',
  'Transfer to HTB-2024-10003 — Dinner split',
  'Transfer to HTB-2024-10002 — Birthday gift',
  'Transfer to HTB-2024-10004 — Loan repayment',
  'Transfer to HTB-2024-10003 — Grocery split',
];

const transferInDescriptions = [
  'Transfer from HTB-2024-10001 — Rent share',
  'Transfer from HTB-2024-10001 — Birthday gift',
  'Transfer from HTB-2024-10003 — Movie tickets',
  'Transfer from HTB-2024-10004 — Refund',
];

function generateTransactionHistory(
  accountId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  startingBalance: number,
  startDate: Date,
  endDate: Date,
): Array<{
  account_id: mongoose.Types.ObjectId;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  description: string;
  created_by: mongoose.Types.ObjectId;
  created_at: Date;
}> {
  const transactions: Array<{
    account_id: mongoose.Types.ObjectId;
    type: 'credit' | 'debit';
    amount: number;
    balance_after: number;
    description: string;
    created_by: mongoose.Types.ObjectId;
    created_at: Date;
  }> = [];

  let balance = startingBalance;
  const current = new Date(startDate);

  // Initial deposit
  transactions.push({
    account_id: accountId,
    type: 'credit',
    amount: startingBalance,
    balance_after: balance,
    description: 'Initial deposit — Account opening',
    created_by: userId,
    created_at: new Date(current),
  });

  current.setDate(current.getDate() + 1);

  while (current <= endDate) {
    // 1–4 transactions per day, with some days having none
    const txnCount = rand(0, 4);

    for (let i = 0; i < txnCount; i++) {
      // Salary every ~15th and ~30th
      const day = current.getDate();
      let type: 'credit' | 'debit';
      let amount: number;
      let description: string;

      if ((day === 15 || day === 30) && i === 0) {
        // Salary deposit
        type = 'credit';
        amount = rand(2800, 4500);
        description = 'Salary — Direct Deposit';
      } else if (rand(1, 100) <= 35) {
        // 35% chance of credit
        type = 'credit';
        amount = pick([
          rand(10, 100),    // small credits
          rand(100, 500),   // medium credits
          rand(500, 2000),  // larger credits
        ]);
        const desc = pick(creditDescriptions);
        description = desc.includes('#') ? desc + rand(1000, 9999) : desc;
      } else {
        // 65% chance of debit
        type = 'debit';
        amount = pick([
          rand(3, 30),      // coffee, small purchases
          rand(30, 150),    // medium purchases
          rand(150, 800),   // larger purchases
          rand(800, 2000),  // big purchases (rent, etc.)
        ]);
        description = pick(debitDescriptions);
      }

      // Add transfer transactions occasionally
      if (rand(1, 100) <= 8) {
        type = 'debit';
        amount = rand(50, 500);
        description = pick(transferDescriptions);
      } else if (rand(1, 100) <= 5) {
        type = 'credit';
        amount = rand(20, 300);
        description = pick(transferInDescriptions);
      }

      // Don't go below $100
      if (type === 'debit' && balance - amount < 100) {
        // Force a salary / credit instead
        type = 'credit';
        amount = rand(1000, 3000);
        description = 'Salary — Direct Deposit';
      }

      if (type === 'credit') {
        balance += amount;
      } else {
        balance -= amount;
      }

      // Random time during the day
      const txnDate = new Date(current);
      txnDate.setHours(rand(6, 23), rand(0, 59), rand(0, 59));

      transactions.push({
        account_id: accountId,
        type,
        amount,
        balance_after: Math.round(balance * 100) / 100,
        description,
        created_by: userId,
        created_at: txnDate,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return transactions;
}

const seed = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Connected to MongoDB');

    await User.deleteMany({});
    await Account.deleteMany({});
    await Transaction.deleteMany({});
    await AuditLog.deleteMany({});
    console.log('Cleared existing data');

    // Create admin
    const admin = await User.create({
      full_name: 'Admin User',
      email: 'admin@heritagetrust.com',
      password: 'Admin123!',
      role: 'admin',
      is_verified: true,
      is_active: true,
    });
    console.log('Admin created: admin@heritagetrust.com / Admin123!');

    // ── Customer 1: John Doe (verified, heavy history) ──
    const customer1 = await User.create({
      full_name: 'John Doe',
      email: 'john@example.com',
      password: 'Customer123!',
      phone: '+1 (555) 123-4567',
      role: 'customer',
      is_verified: true,
      verified_at: new Date('2025-01-05'),
      verified_by: admin._id,
      is_active: true,
      created_at: new Date('2025-01-01'),
    });

    const account1 = await Account.create({
      user_id: customer1._id,
      account_number: 'HTB-2024-10001',
      balance: 0, // will be set after transactions
      currency: 'USD',
    });

    const txns1 = generateTransactionHistory(
      account1._id,
      customer1._id,
      5000,
      new Date('2025-01-01'),
      new Date('2025-12-31'),
    );

    // Insert in batches
    for (let i = 0; i < txns1.length; i += 100) {
      await Transaction.insertMany(txns1.slice(i, i + 100));
    }

    // Set final balance
    const finalBalance1 = txns1[txns1.length - 1].balance_after;
    account1.balance = finalBalance1;
    await account1.save();

    console.log(`John Doe: ${txns1.length} transactions, final balance: $${finalBalance1.toLocaleString()}`);

    // ── Customer 2: Jane Smith (unverified) ──
    const customer2 = await User.create({
      full_name: 'Jane Smith',
      email: 'jane@example.com',
      password: 'Customer123!',
      phone: '+1 (555) 987-6543',
      role: 'customer',
      is_verified: false,
      is_active: true,
      created_at: new Date('2025-03-15'),
    });

    const account2 = await Account.create({
      user_id: customer2._id,
      account_number: 'HTB-2024-10002',
      balance: 0,
      currency: 'USD',
    });

    const txns2 = generateTransactionHistory(
      account2._id,
      customer2._id,
      2500,
      new Date('2025-03-15'),
      new Date('2025-12-31'),
    );

    for (let i = 0; i < txns2.length; i += 100) {
      await Transaction.insertMany(txns2.slice(i, i + 100));
    }

    const finalBalance2 = txns2[txns2.length - 1].balance_after;
    account2.balance = finalBalance2;
    await account2.save();

    console.log(`Jane Smith: ${txns2.length} transactions, final balance: $${finalBalance2.toLocaleString()}`);

    // ── Customer 3: Michael Chen (verified) ──
    const customer3 = await User.create({
      full_name: 'Michael Chen',
      email: 'michael@example.com',
      password: 'Customer123!',
      phone: '+1 (555) 456-7890',
      role: 'customer',
      is_verified: true,
      verified_at: new Date('2025-02-20'),
      verified_by: admin._id,
      is_active: true,
      created_at: new Date('2025-02-10'),
    });

    const account3 = await Account.create({
      user_id: customer3._id,
      account_number: 'HTB-2024-10003',
      balance: 0,
      currency: 'USD',
    });

    const txns3 = generateTransactionHistory(
      account3._id,
      customer3._id,
      8000,
      new Date('2025-02-10'),
      new Date('2025-12-31'),
    );

    for (let i = 0; i < txns3.length; i += 100) {
      await Transaction.insertMany(txns3.slice(i, i + 100));
    }

    const finalBalance3 = txns3[txns3.length - 1].balance_after;
    account3.balance = finalBalance3;
    await account3.save();

    console.log(`Michael Chen: ${txns3.length} transactions, final balance: $${finalBalance3.toLocaleString()}`);

    // ── Customer 4: Sarah Williams (verified) ──
    const customer4 = await User.create({
      full_name: 'Sarah Williams',
      email: 'sarah@example.com',
      password: 'Customer123!',
      role: 'customer',
      is_verified: true,
      verified_at: new Date('2025-06-05'),
      verified_by: admin._id,
      is_active: true,
      created_at: new Date('2025-06-01'),
    });

    const account4 = await Account.create({
      user_id: customer4._id,
      account_number: 'HTB-2024-10004',
      balance: 0,
      currency: 'USD',
    });

    const txns4 = generateTransactionHistory(
      account4._id,
      customer4._id,
      3500,
      new Date('2025-06-01'),
      new Date('2025-12-31'),
    );

    for (let i = 0; i < txns4.length; i += 100) {
      await Transaction.insertMany(txns4.slice(i, i + 100));
    }

    const finalBalance4 = txns4[txns4.length - 1].balance_after;
    account4.balance = finalBalance4;
    await account4.save();

    console.log(`Sarah Williams: ${txns4.length} transactions, final balance: $${finalBalance4.toLocaleString()}`);

    // ── Customer 5: David Brown (unverified, new) ──
    const customer5 = await User.create({
      full_name: 'David Brown',
      email: 'david@example.com',
      password: 'Customer123!',
      phone: '+1 (555) 321-0987',
      role: 'customer',
      is_verified: false,
      is_active: true,
      created_at: new Date('2025-11-01'),
    });

    const account5 = await Account.create({
      user_id: customer5._id,
      account_number: 'HTB-2024-10005',
      balance: 0,
      currency: 'USD',
    });

    const txns5 = generateTransactionHistory(
      account5._id,
      customer5._id,
      1500,
      new Date('2025-11-01'),
      new Date('2025-12-31'),
    );

    for (let i = 0; i < txns5.length; i += 100) {
      await Transaction.insertMany(txns5.slice(i, i + 100));
    }

    const finalBalance5 = txns5[txns5.length - 1].balance_after;
    account5.balance = finalBalance5;
    await account5.save();

    console.log(`David Brown: ${txns5.length} transactions, final balance: $${finalBalance5.toLocaleString()}`);

    // ── Audit Logs ──
    const auditLogs = [
      { admin_id: admin._id, action: 'create_user', target_user_id: customer1._id, details: { email: 'john@example.com' }, created_at: new Date('2025-01-01T10:00:00') },
      { admin_id: admin._id, action: 'verify_user', target_user_id: customer1._id, details: {}, created_at: new Date('2025-01-05T14:30:00') },
      { admin_id: admin._id, action: 'create_user', target_user_id: customer3._id, details: { email: 'michael@example.com' }, created_at: new Date('2025-02-10T09:00:00') },
      { admin_id: admin._id, action: 'verify_user', target_user_id: customer3._id, details: {}, created_at: new Date('2025-02-20T11:15:00') },
      { admin_id: admin._id, action: 'create_user', target_user_id: customer2._id, details: { email: 'jane@example.com' }, created_at: new Date('2025-03-15T08:45:00') },
      { admin_id: admin._id, action: 'update_balance', target_user_id: customer1._id, details: { amount: 500, type: 'credit', reason: 'Bonus adjustment' }, created_at: new Date('2025-04-10T16:00:00') },
      { admin_id: admin._id, action: 'create_user', target_user_id: customer4._id, details: { email: 'sarah@example.com' }, created_at: new Date('2025-06-01T10:30:00') },
      { admin_id: admin._id, action: 'verify_user', target_user_id: customer4._id, details: {}, created_at: new Date('2025-06-05T13:00:00') },
      { admin_id: admin._id, action: 'update_balance', target_user_id: customer3._id, details: { amount: 1000, type: 'credit', reason: 'Promotion credit' }, created_at: new Date('2025-08-22T09:30:00') },
      { admin_id: admin._id, action: 'create_user', target_user_id: customer5._id, details: { email: 'david@example.com' }, created_at: new Date('2025-11-01T11:00:00') },
      { admin_id: admin._id, action: 'update_balance', target_user_id: customer2._id, details: { amount: 200, type: 'credit', reason: 'Referral bonus' }, created_at: new Date('2025-12-15T14:45:00') },
    ];

    await AuditLog.insertMany(auditLogs);
    console.log(`Created ${auditLogs.length} audit log entries`);

    const totalTxns = txns1.length + txns2.length + txns3.length + txns4.length + txns5.length;
    console.log(`\nSeed complete! ${totalTxns} total transactions across 5 customers.`);
    console.log('\nLogin credentials:');
    console.log('  Admin:    admin@heritagetrust.com / Admin123!');
    console.log('  Customer: john@example.com / Customer123!  (verified)');
    console.log('  Customer: jane@example.com / Customer123!  (unverified)');
    console.log('  Customer: michael@example.com / Customer123!  (verified)');
    console.log('  Customer: sarah@example.com / Customer123!  (verified)');
    console.log('  Customer: david@example.com / Customer123!  (unverified)');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();
