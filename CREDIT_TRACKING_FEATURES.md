# 💳 Credit Tracking Features in Backup

## 📋 Tổng quan

Tính năng backup đã được mở rộng để bao gồm **Credit Tracking** - theo dõi và báo cáo về tình trạng credit âm và tính năng mua nợ của users. Điều này giúp admin có cái nhìn tổng quan về tình trạng tài chính của hệ thống.

## 🔧 Tính năng đã thêm

### 1. **Negative Credit Tracking**
- ✅ **Đếm số user có credit âm**
- ✅ **Hiển thị danh sách user với credit âm**
- ✅ **Tính tổng số credit âm trong hệ thống**

### 2. **Negative Purchase Tracking**
- ✅ **Đếm số user được phép mua nợ**
- ✅ **Hiển thị danh sách user có tính năng mua nợ**
- ✅ **Theo dõi trạng thái `allow_negative_purchase`**

### 3. **Telegram Integration**
- ✅ **Credit Status trong caption**
- ✅ **Thông tin chi tiết về credit âm**
- ✅ **Báo cáo real-time qua Telegram**

## 📊 Logic Credit Tracking

### Code Implementation:
```javascript
// Calculate negative credit statistics
const negativeCreditUsers = backupData.users.filter(user => user.credits < 0);
const negativePurchaseUsers = backupData.users.filter(user => user.allow_negative_purchase == 1);
const totalNegativeCredit = negativeCreditUsers.reduce((sum, user) => sum + user.credits, 0);

// Add to Telegram caption
const caption = `📤 <b>Database Backup (v1.2)</b>\n\n📅 Date: ${new Date().toLocaleString()}\n👥 Users: ${backupData.users.length}\n📦 Products: ${backupData.accounts.length}\n💰 Orders: ${backupData.download_history.length}\n🎫 User Discounts: ${backupData.user_discounts.length}\n🏷️ Coupon Codes: ${backupData.coupon_codes.length}\n🤝 Shared Accounts: ${backupData.shared_accounts.length}\n\n💳 Credit Status:\n   • Negative Credit Users: ${negativeCreditUsers.length}\n   • Negative Purchase Enabled: ${negativePurchaseUsers.length}\n   • Total Negative Credit: ${totalNegativeCredit}\n\n💾 File: ${backupFileName}\n🔧 Format: Compatible with new restore logic`;
```

## 🎯 Thông tin được hiển thị

### 1. **Negative Credit Users**
- Số lượng user có credit âm
- Danh sách username và số credit âm
- Trạng thái negative purchase

### 2. **Negative Purchase Enabled**
- Số lượng user được phép mua nợ
- Danh sách user có tính năng này
- Credit hiện tại của họ

### 3. **Total Negative Credit**
- Tổng số credit âm trong hệ thống
- Giúp admin đánh giá rủi ro tài chính

## 📱 Telegram Notification

### Caption Format:
```
📤 <b>Database Backup (v1.2)</b>

📅 Date: 8/7/2025, 2:14:35 AM
👥 Users: 22
📦 Products: 4
💰 Orders: 782
🎫 User Discounts: 23
🏷️ Coupon Codes: 0
🤝 Shared Accounts: 0

💳 Credit Status:
   • Negative Credit Users: 1
   • Negative Purchase Enabled: 1
   • Total Negative Credit: -11300

💾 File: backup_1754507675650.json
🔧 Format: Compatible with new restore logic
```

## 🚀 Test Results

### Credit Statistics:
```
📊 Credit Statistics:
  - Total Users: 22
  - Negative Credit Users: 1
  - Negative Purchase Enabled: 1
  - Total Negative Credit: -11300

🔴 Users with Negative Credit:
  • PrimeSoft-Hub: -11300 credits (Negative Purchase: Yes)

🟢 Users with Negative Purchase Enabled:
  • PrimeSoft-Hub: -11300 credits
```

## 🎯 Lợi ích

### 1. **Quản lý rủi ro**
- Theo dõi tổng credit âm trong hệ thống
- Đánh giá mức độ rủi ro tài chính
- Cảnh báo sớm về tình trạng credit

### 2. **Báo cáo chi tiết**
- Thông tin real-time qua Telegram
- Danh sách user cần chú ý
- Thống kê chi tiết về credit status

### 3. **Quản lý tính năng mua nợ**
- Theo dõi số user được phép mua nợ
- Kiểm soát việc sử dụng tính năng
- Báo cáo hiệu quả sử dụng

## 🔄 Tích hợp với Backup System

### 1. **Automatic Integration**
- Tự động tính toán khi tạo backup
- Không cần cấu hình thêm
- Hoạt động với cả backup thủ công và tự động

### 2. **Backward Compatibility**
- Tương thích với backup cũ
- Không ảnh hưởng đến logic restore
- Tăng cường thông tin mà không phá vỡ cấu trúc

### 3. **Performance**
- Tính toán nhanh chóng
- Không làm chậm quá trình backup
- Thông tin được cache hiệu quả

## 📝 Use Cases

### 1. **Daily Monitoring**
- Admin có thể theo dõi credit status hàng ngày
- Nhận thông báo qua Telegram
- Phát hiện sớm vấn đề tài chính

### 2. **Risk Assessment**
- Đánh giá tổng credit âm
- Quyết định về chính sách credit
- Lập kế hoạch thu hồi nợ

### 3. **Feature Management**
- Theo dõi việc sử dụng tính năng mua nợ
- Đánh giá hiệu quả của tính năng
- Điều chỉnh chính sách nếu cần

---

**Credit tracking features đã được tích hợp hoàn toàn vào backup system!** 🎉 