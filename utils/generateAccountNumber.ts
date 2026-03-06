import Account from '../models/Account';

const generateAccountNumber = async (): Promise<string> => {
  let accountNumber: string;
  let exists: any = true;

  while (exists) {
    const rand = Math.floor(10000 + Math.random() * 90000);
    accountNumber = `HTB-2024-${rand}`;
    exists = await Account.findOne({ account_number: accountNumber });
  }

  return accountNumber!;
};

export default generateAccountNumber;
