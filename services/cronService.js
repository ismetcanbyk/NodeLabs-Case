import cron from 'node-cron';
import User from '../models/User.js';
import AutoMessage from '../models/AutoMessage.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import rabbitService from './rabbitService.js';

class CronService {
  constructor() {
    this.planningJob = null;
    this.queueJob = null;
    this.isRunning = false;
  }

  // 1. ADIM: Mesaj Planlama Servisi (Gece 02:00)
  startMessagePlanningJob() {
    // Her gece saat 02:00'da çalışır
    this.planningJob = cron.schedule('0 2 * * *', async () => {
      console.log('🕒 Starting automatic message planning job at 02:00...');
      await this.planAutoMessages();
    }, {
      scheduled: false,
      timezone: "Europe/Istanbul"
    });

    this.planningJob.start();
    console.log('✅ Message planning cron job scheduled for 02:00 daily');
  }

  // 2. ADIM: Kuyruk Yönetimi Servisi (Her dakika)
  startQueueManagementJob() {
    // Her dakika çalışır
    this.queueJob = cron.schedule('* * * * *', async () => {
      console.log('📥 Checking for messages ready to queue...');
      await this.processQueueManagement();
    }, {
      scheduled: false
    });

    this.queueJob.start();
    console.log('✅ Queue management cron job scheduled to run every minute');
  }

  // Mesaj Planlama Algoritması
  async planAutoMessages() {
    try {
      console.log('📋 Starting message planning process...');

      // Aktif kullanıcıları çek
      const activeUsers = await User.find({
        isActive: true,
      }).select('_id username email');

      console.log(activeUsers);

      if (activeUsers.length < 2) {
        console.log('⚠️ Not enough active users for message pairing');
        return;
      }

      console.log(`👥 Found ${activeUsers.length} active users`);

      // Kullanıcı listesini rastgele karıştır (shuffle)
      const shuffledUsers = this.shuffleArray([...activeUsers]);

      // İkişerli gruplara ayır
      const pairs = [];
      for (let i = 0; i < shuffledUsers.length - 1; i += 2) {
        const sender = shuffledUsers[i];
        const receiver = shuffledUsers[i + 1];
        pairs.push({ sender, receiver });
      }

      console.log(`💌 Created ${pairs.length} user pairs`);

      // Her çift için otomatik mesaj oluştur
      const batchId = `batch_${Date.now()}`;
      const autoMessages = [];

      for (const pair of pairs) {
        // Konuşma bul veya oluştur
        let conversation = await Conversation.findOne({
          participants: { $all: [pair.sender._id, pair.receiver._id] }
        });

        if (!conversation) {
          conversation = new Conversation({
            participants: [pair.sender._id, pair.receiver._id],
            isActive: true
          });
          await conversation.save();
        }

        // Rastgele mesaj içeriği ve gönderim zamanı
        const messageContent = this.generateRandomMessage();
        const sendDate = this.generateRandomSendDate();

        const autoMessage = {
          sender: pair.sender._id,
          receiver: pair.receiver._id,
          conversationId: conversation._id,
          content: {
            text: messageContent.text,
            template: messageContent.template
          },
          scheduledDate: new Date(),
          sendDate: sendDate,
          status: 'scheduled',
          metadata: {
            generatedBy: 'cron_job',
            batchId: batchId,
            priority: Math.floor(Math.random() * 5) + 3, // 3-7 arası priority
            category: 'daily'
          }
        };

        autoMessages.push(autoMessage);
      }

      // Toplu kaydetme
      const savedMessages = await AutoMessage.insertMany(autoMessages);
      console.log(`✅ Successfully planned ${savedMessages.length} auto messages for batch ${batchId}`);

      // İstatistik log
      const nextSendTime = Math.min(...autoMessages.map(m => m.sendDate.getTime()));
      console.log(`📅 Next message will be sent at: ${new Date(nextSendTime)}`);

    } catch (error) {
      console.error('❌ Error in message planning job:', error);
    }
  }

  // Kuyruk Yönetimi İşlemi
  async processQueueManagement() {
    try {
      // Gönderim zamanı gelen ve henüz kuyruğa alınmamış mesajları bul
      const readyMessages = await AutoMessage.findReadyForQueue();

      if (readyMessages.length === 0) {
        return; // Sessizce çık, log spam'ı önlemek için
      }

      console.log(`🔄 Found ${readyMessages.length} messages ready for queue processing`);

      for (const autoMessage of readyMessages) {
        try {
          // RabbitMQ kuyruğuna gönder
          const success = await rabbitService.sendAutoMessageToQueue(autoMessage);

          if (success) {
            // AutoMessage'ı isQueued: true olarak güncelle
            await AutoMessage.findByIdAndUpdate(autoMessage._id, {
              isQueued: true,
              queuedAt: new Date(),
              status: 'queued'
            });

            console.log(`📤 Message ${autoMessage._id} queued successfully`);
          } else {
            // Hata durumunda retry count artır
            await AutoMessage.findByIdAndUpdate(autoMessage._id, {
              $inc: { 'error.retryCount': 1 },
              'error.message': 'Failed to queue message',
              'error.timestamp': new Date()
            });

            console.log(`❌ Failed to queue message ${autoMessage._id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing message ${autoMessage._id}:`, error);

          await AutoMessage.findByIdAndUpdate(autoMessage._id, {
            status: 'failed',
            'error.message': error.message,
            'error.timestamp': new Date(),
            $inc: { 'error.retryCount': 1 }
          });
        }
      }

    } catch (error) {
      console.error('❌ Error in queue management job:', error);
    }
  }

  // 3. ADIM: Mesaj Dağıtım Handler (RabbitMQ Consumer için)
  async handleMessageDistribution(messageData) {
    try {
      console.log(`📨 Processing message distribution for ${messageData.autoMessageId}`);

      // AutoMessage'ı bul
      const autoMessage = await AutoMessage.findById(messageData.autoMessageId)
        .populate('sender receiver conversationId');

      if (!autoMessage) {
        console.error(`❌ AutoMessage not found: ${messageData.autoMessageId}`);
        return false;
      }

      // Conversation'ı bul
      let conversation = await Conversation.findById(autoMessage.conversationId);
      if (!conversation) {
        console.error(`❌ Conversation not found: ${autoMessage.conversationId}`);
        return false;
      }

      // Yeni Message oluştur
      const newMessage = new Message({
        conversation: conversation._id,
        sender: autoMessage.sender._id,
        content: {
          text: autoMessage.content.text
        },
        messageType: 'auto',
        status: 'sent'
      });

      await newMessage.save();

      // Conversation'ı güncelle
      await Conversation.findByIdAndUpdate(conversation._id, {
        lastMessage: newMessage._id,
        lastMessageTime: new Date(),
        $inc: { totalMessages: 1 }
      });

      // AutoMessage'ı tamamlandı olarak işaretle
      await AutoMessage.findByIdAndUpdate(autoMessage._id, {
        isSent: true,
        sentAt: new Date(),
        status: 'sent',
        messageId: newMessage._id
      });



      console.log(`✅ Message ${messageData.autoMessageId} distributed successfully`);
      return true;

    } catch (error) {
      console.error(`❌ Error in message distribution for ${messageData.autoMessageId}:`, error);

      // AutoMessage'ı failed olarak işaretle
      try {
        await AutoMessage.findByIdAndUpdate(messageData.autoMessageId, {
          status: 'failed',
          'error.message': error.message,
          'error.timestamp': new Date(),
          $inc: { 'error.retryCount': 1 }
        });
      } catch (updateError) {
        console.error('Failed to update AutoMessage status:', updateError);
      }

      return false;
    }
  }

  // Yardımcı metodlar
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  generateRandomMessage() {
    const templates = [
      {
        type: 'greeting', messages: [
          'Merhaba! Nasıl gidiyor?',
          'Selam! Bugün nasıl geçiyor?',
          'Hey! Ne haber?',
          'Merhaba! Umarım güzel bir gün geçiriyorsundur.'
        ]
      },
      {
        type: 'motivation', messages: [
          'Bugün harika şeyler yapacağına inanıyorum!',
          'Sen her şeyin üstesinden gelebilirsin!',
          'Hedeflerine ulaşmak için doğru yoldasın.',
          'Başarıya giden yolda önemli adımlar atıyorsun.'
        ]
      },
      {
        type: 'question', messages: [
          'En sevdiğin mevsim hangisi?',
          'Bugün seni mutlu eden bir şey var mı?',
          'En son ne zaman yeni bir şey öğrendin?',
          'Hafta sonu için planların neler?'
        ]
      },
      {
        type: 'fun_fact', messages: [
          'Biliyor muydun? Bir balina kalbi araba kadar büyük olabilir!',
          'İlginç bilgi: Okyanusların sadece %5\'i keşfedilmiş durumda.',
          'Tahmin et: Bir günde 20.000 kez nefes alırız!',
          'Şaşırtıcı: Karıncalar hiç uyumaz!'
        ]
      },
      {
        type: 'quote', messages: [
          '"Başarı, hazırlık fırsatla buluştuğunda doğar." - Seneca',
          '"Geleceği tahmin etmenin en iyi yolu onu yaratmaktır." - Peter Drucker',
          '"Hayatta en önemli şey yönünüzü kaybetmemektir." - Konfüçyüs',
          '"Büyük işler yapmak için tek yol, yaptığınız işi sevmektir." - Steve Jobs'
        ]
      }
    ];

    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const randomMessage = randomTemplate.messages[Math.floor(Math.random() * randomTemplate.messages.length)];

    return {
      text: randomMessage,
      template: randomTemplate.type
    };
  }

  generateRandomSendDate() {
    // Şimdi + 1 saat ile şimdi + 24 saat arası rastgele zaman
    const now = new Date();
    const minHours = 1;
    const maxHours = 24;
    const randomHours = Math.random() * (maxHours - minHours) + minHours;

    return new Date(now.getTime() + (randomHours * 60 * 60 * 1000));
  }

  // Cron job'ları başlat
  startAllJobs() {
    console.log('🚀 Starting all cron jobs...');
    this.startMessagePlanningJob();
    this.startQueueManagementJob();
    this.isRunning = true;
    console.log('✅ All cron jobs started successfully');
  }

  // Cron job'ları durdur
  stopAllJobs() {
    console.log('🛑 Stopping all cron jobs...');

    if (this.planningJob) {
      this.planningJob.stop();
      this.planningJob = null;
    }

    if (this.queueJob) {
      this.queueJob.stop();
      this.queueJob = null;
    }

    this.isRunning = false;
    console.log('✅ All cron jobs stopped');
  }

  // Test için manuel tetikleme
  async triggerPlanningJob() {
    console.log('🧪 Manually triggering message planning job...');
    await this.planAutoMessages();
  }

  async triggerQueueJob() {
    console.log('🧪 Manually triggering queue management job...');
    await this.processQueueManagement();
  }

  // İstatistik
  async getJobStatistics() {
    try {
      const stats = await AutoMessage.getStatistics();
      const queueInfo = await rabbitService.getQueueInfo();
      const failedInfo = await rabbitService.getFailedMessages();

      return {
        isRunning: this.isRunning,
        autoMessages: stats,
        rabbitMQ: {
          queue: queueInfo,
          failedMessages: failedInfo
        }
      };
    } catch (error) {
      console.error('Error getting job statistics:', error);
      return { error: error.message };
    }
  }
}

// Singleton instance
const cronService = new CronService();

export default cronService; 