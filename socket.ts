import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User, { IUser } from './models/User';
import Chat, { IChat } from './models/Chat';

interface AuthSocket extends Socket {
  user?: IUser;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are the official AI support assistant for NileTrust Bank, a federally chartered digital bank based in the United States. You are professional, warm, and deeply knowledgeable about all of the bank's products and services.

About NileTrust Bank:
- A federally insured digital bank headquartered in New York, NY
- Member FDIC — deposits insured up to $250,000
- Provides secure personal and consumer banking services through its online platform
- Supported currencies: USD, EUR, GBP, NGN

Platform Features & How They Work:

1. DASHBOARD: Displays account balance, recent transactions, quick action buttons (Transfer, Withdraw, View History), and a help center.

2. TRANSFERS: Customers can send funds to other NileTrust accounts. Steps: Enter recipient account number → Click "Verify" to confirm recipient name → Enter amount and optional memo → Review details → Confirm transfer. Account verification is required before initiating transfers.

3. WITHDRAWALS: Available from the Dashboard. Enter the withdrawal amount and confirm. Account verification is required.

4. TRANSACTION HISTORY: Complete transaction records with filters by type (Debit/Credit/Adjustment), date range, and keyword search. Supports CSV export for personal records.

5. PROFILE: View and update personal information (name, email, phone). Change password securely (current password required). Displays account details including account number, currency, and account opening date.

6. FINANCIAL PRODUCTS: Browse offerings including High-Yield Savings, Fixed Deposits (CDs), Personal Loans, and Credit Cards. Customers can express interest and a representative will follow up.

7. SETTINGS: Security (two-factor authentication, biometric login, session timeout, login activity), notification preferences, display settings, privacy & data management, and support contacts.

Account Verification:
- New accounts require identity verification before full access is granted
- Verification is required to unlock transfers and withdrawals
- To verify your account, please contact our support team directly:
  - Email: niletrustbank@gmail.com
  - Phone: +1 (364) 225-8074 (Monday–Friday, 7 AM – 9 PM ET | Saturday, 9 AM – 5 PM ET)
- Our support team will guide you through the verification process and get your account fully activated
- IMPORTANT: When a user asks about account verification, ALWAYS tell them to contact the support team and provide the email and phone number above. Do NOT tell them to complete any self-service verification steps.

Security:
- 256-bit AES encryption on all data in transit and at rest
- Automatic session timeout after 20 minutes of inactivity
- Login activity monitoring available in Settings
- Two-factor authentication available for enhanced protection

Customer Service:
- Email: niletrustbank@gmail.com
- Phone: +1 (364) 225-8074 (Monday–Friday, 7 AM – 9 PM ET | Saturday, 9 AM – 5 PM ET)
- Live Chat: Available 24/7 through our AI assistant (that's you)

Rules for your responses:
- Keep responses concise (2-4 sentences typically, unless a detailed explanation is needed)
- Maintain a professional, reassuring tone — you represent a real US bank
- Never reveal internal system details, API endpoints, or technical implementation
- If asked about topics unrelated to banking, politely redirect to banking services
- Never share, confirm, or speculate about any customer's personal or financial data
- If a customer needs human assistance, direct them to niletrustbank@gmail.com or +1 (364) 225-8074
- Always be solution-oriented and guide customers with specific steps
- Never say "I'm just an AI" — present yourself as NileTrust's virtual banking assistant
- When users ask about verifying their account, ALWAYS direct them to contact the support team at niletrustbank@gmail.com or +1 (364) 225-8074. Tell them the support team will assist with the verification process.`;

async function getAIResponse(messages: { sender: string; text: string }[]): Promise<string> {
  const chatMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: (m.sender === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    })),
  ];

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);

  const data: any = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('No response from AI');
  return reply;
}

export function setupSocket(server: HttpServer, allowedOrigins: string[]) {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    },
  });

  // Auth middleware — verify JWT
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
      const user = await User.findById(decoded.id);
      if (!user || !user.is_active) return next(new Error('Invalid user'));

      socket.user = user;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  // Track which admin sockets are watching which chats
  const adminRooms = new Map<string, Set<string>>(); // chatId -> Set<socketId>

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthSocket;
    const user = socket.user!;

    // Join a personal room for targeted events
    socket.join(`user:${user._id}`);
    if (user.role === 'admin') {
      socket.join('admins');
    }

    // ─── CUSTOMER EVENTS ───

    // Customer starts or resumes a chat
    socket.on('chat:start', async (callback: (data: any) => void) => {
      if (user.role !== 'customer') return;

      try {
        // Find existing open chat or create new one
        let chat = await Chat.findOne({
          customer_id: user._id,
          status: { $ne: 'closed' },
        });

        if (!chat) {
          chat = await Chat.create({
            customer_id: user._id,
            customer_name: user.full_name,
            messages: [
              {
                sender: 'ai',
                text: "Hello! Welcome to NileTrust Bank. I'm your support assistant — how can I help you today?",
              },
            ],
          });
        }

        socket.join(`chat:${chat._id}`);
        callback({ success: true, chat });

        // Notify admins of active chat
        io.to('admins').emit('chat:updated', {
          _id: chat._id,
          customer_name: chat.customer_name,
          status: chat.status,
          updated_at: chat.updated_at,
          lastMessage: chat.messages[chat.messages.length - 1],
        });
      } catch {
        callback({ success: false, message: 'Failed to start chat' });
      }
    });

    // Customer sends a message
    socket.on('chat:message', async (data: { chatId: string; text: string }, callback: (data: any) => void) => {
      if (user.role !== 'customer') return;

      try {
        const chat = await Chat.findOne({ _id: data.chatId, customer_id: user._id, status: { $ne: 'closed' } });
        if (!chat) return callback({ success: false, message: 'Chat not found' });

        // Add customer message
        chat.messages.push({ sender: 'customer', text: data.text, created_at: new Date() });
        await chat.save();

        // Broadcast customer message to the chat room (admin sees it)
        io.to(`chat:${chat._id}`).emit('chat:newMessage', {
          chatId: chat._id.toString(),
          message: chat.messages[chat.messages.length - 1],
        });

        // Notify admins list
        io.to('admins').emit('chat:updated', {
          _id: chat._id,
          customer_name: chat.customer_name,
          status: chat.status,
          updated_at: chat.updated_at,
          lastMessage: chat.messages[chat.messages.length - 1],
        });

        if (chat.status === 'ai') {
          // Get AI response
          const aiMessages = chat.messages
            .filter((m) => m.sender === 'customer' || m.sender === 'ai')
            .map((m) => ({ sender: m.sender, text: m.text }));

          try {
            const aiReply = await getAIResponse(aiMessages);
            chat.messages.push({ sender: 'ai', text: aiReply, created_at: new Date() });
            await chat.save();

            io.to(`chat:${chat._id}`).emit('chat:newMessage', {
              chatId: chat._id.toString(),
              message: chat.messages[chat.messages.length - 1],
            });

            io.to('admins').emit('chat:updated', {
              _id: chat._id,
              customer_name: chat.customer_name,
              status: chat.status,
              updated_at: chat.updated_at,
              lastMessage: chat.messages[chat.messages.length - 1],
            });
          } catch {
            const errorMsg = {
              sender: 'ai' as const,
              text: "I'm having trouble connecting right now. Please try again, or reach us at niletrustbank@gmail.com or +1 (364) 225-8074.",
              created_at: new Date(),
            };
            chat.messages.push(errorMsg);
            await chat.save();

            io.to(`chat:${chat._id}`).emit('chat:newMessage', {
              chatId: chat._id.toString(),
              message: chat.messages[chat.messages.length - 1],
            });
          }
        }

        callback({ success: true });
      } catch {
        callback({ success: false, message: 'Failed to send message' });
      }
    });

    // Customer closes chat
    socket.on('chat:close', async (data: { chatId: string }) => {
      if (user.role !== 'customer') return;
      try {
        const chat = await Chat.findOneAndUpdate(
          { _id: data.chatId, customer_id: user._id },
          { status: 'closed' },
          { new: true }
        );
        if (chat) {
          io.to(`chat:${chat._id}`).emit('chat:closed', { chatId: chat._id.toString() });
          io.to('admins').emit('chat:updated', {
            _id: chat._id,
            customer_name: chat.customer_name,
            status: 'closed',
            updated_at: chat.updated_at,
            lastMessage: chat.messages[chat.messages.length - 1],
          });
        }
      } catch { /* silent */ }
    });

    // ─── ADMIN EVENTS ───

    // Admin gets list of active chats
    socket.on('admin:getChats', async (callback: (data: any) => void) => {
      if (user.role !== 'admin') return;

      try {
        const chats = await Chat.find({ status: { $ne: 'closed' } })
          .sort({ updated_at: -1 })
          .select('customer_name status admin_id updated_at messages');

        const chatList = chats.map((c) => ({
          _id: c._id,
          customer_name: c.customer_name,
          status: c.status,
          updated_at: c.updated_at,
          lastMessage: c.messages[c.messages.length - 1],
        }));

        callback({ success: true, chats: chatList });
      } catch {
        callback({ success: false, message: 'Failed to load chats' });
      }
    });

    // Admin joins a specific chat to view messages
    socket.on('admin:joinChat', async (data: { chatId: string }, callback: (data: any) => void) => {
      if (user.role !== 'admin') return;

      try {
        const chat = await Chat.findById(data.chatId);
        if (!chat) return callback({ success: false, message: 'Chat not found' });

        socket.join(`chat:${chat._id}`);
        callback({ success: true, chat });
      } catch {
        callback({ success: false, message: 'Failed to join chat' });
      }
    });

    // Admin takes over the chat from AI
    socket.on('admin:takeover', async (data: { chatId: string }, callback: (data: any) => void) => {
      if (user.role !== 'admin') return;

      try {
        const chat = await Chat.findById(data.chatId);
        if (!chat || chat.status === 'closed') return callback({ success: false, message: 'Chat not found' });

        chat.status = 'admin';
        chat.admin_id = user._id as any;

        const systemMsg = {
          sender: 'ai' as const,
          text: `You are now connected with a live support agent. How can we assist you?`,
          created_at: new Date(),
        };
        chat.messages.push(systemMsg);
        await chat.save();

        io.to(`chat:${chat._id}`).emit('chat:newMessage', {
          chatId: chat._id.toString(),
          message: chat.messages[chat.messages.length - 1],
        });

        io.to(`chat:${chat._id}`).emit('chat:takenOver', {
          chatId: chat._id.toString(),
        });

        io.to('admins').emit('chat:updated', {
          _id: chat._id,
          customer_name: chat.customer_name,
          status: 'admin',
          updated_at: chat.updated_at,
          lastMessage: chat.messages[chat.messages.length - 1],
        });

        callback({ success: true });
      } catch {
        callback({ success: false, message: 'Failed to take over chat' });
      }
    });

    // Admin sends a message
    socket.on('admin:message', async (data: { chatId: string; text: string }, callback: (data: any) => void) => {
      if (user.role !== 'admin') return;

      try {
        const chat = await Chat.findOne({ _id: data.chatId, status: 'admin' });
        if (!chat) return callback({ success: false, message: 'Chat not found or not taken over' });

        chat.messages.push({ sender: 'admin', text: data.text, created_at: new Date() });
        await chat.save();

        io.to(`chat:${chat._id}`).emit('chat:newMessage', {
          chatId: chat._id.toString(),
          message: chat.messages[chat.messages.length - 1],
        });

        io.to('admins').emit('chat:updated', {
          _id: chat._id,
          customer_name: chat.customer_name,
          status: chat.status,
          updated_at: chat.updated_at,
          lastMessage: chat.messages[chat.messages.length - 1],
        });

        callback({ success: true });
      } catch {
        callback({ success: false, message: 'Failed to send message' });
      }
    });

    // Admin closes a chat
    socket.on('admin:closeChat', async (data: { chatId: string }) => {
      if (user.role !== 'admin') return;
      try {
        const chat = await Chat.findByIdAndUpdate(data.chatId, { status: 'closed' }, { new: true });
        if (chat) {
          io.to(`chat:${chat._id}`).emit('chat:closed', { chatId: chat._id.toString() });
          io.to('admins').emit('chat:updated', {
            _id: chat._id,
            customer_name: chat.customer_name,
            status: 'closed',
            updated_at: chat.updated_at,
            lastMessage: chat.messages[chat.messages.length - 1],
          });
        }
      } catch { /* silent */ }
    });

    socket.on('disconnect', () => {
      // cleanup if needed
    });
  });

  return io;
}
