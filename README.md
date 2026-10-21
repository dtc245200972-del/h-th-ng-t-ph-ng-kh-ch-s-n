# An Nhiên Hotel — ứng dụng đặt phòng

Ứng dụng MVP bằng Node.js và SQLite, giao diện tiếng Việt, không cần cài thư viện bên ngoài. Khách có thể tìm phòng còn trống theo ngày và số khách, gửi yêu cầu đặt phòng; quản trị viên có thể xác nhận/hủy đơn và ẩn/hiện hoặc thêm phòng.

## Chạy trên máy

Yêu cầu Node.js 22 trở lên (ứng dụng dùng `node:sqlite`). Trong thư mục dự án:

```powershell
$env:ADMIN_PASSWORD = "mat-khau-quan-tri-cua-ban"
npm.cmd start
```

Mở <http://localhost:3000>. Tệp `data/hotel.db` được tạo tự động và chứa dữ liệu đặt phòng. Có thể đặt cổng khác bằng biến môi trường `PORT`.

## Chạy bằng Docker

```powershell
$env:ADMIN_PASSWORD = "mat-khau-quan-tri-cua-ban"
docker compose up -d --build
```

Ứng dụng mở tại cổng 3000. Cơ sở dữ liệu được giữ trong thư mục `data`.

## Quản trị

Chọn **Quản lý khách sạn** ở cuối trang và đăng nhập bằng giá trị `ADMIN_PASSWORD`. Hãy đặt mật khẩu riêng trước khi chạy; ứng dụng không dùng mật khẩu mặc định an toàn. Phiên đăng nhập được lưu trong cookie HttpOnly và hết hạn sau 8 giờ. Phiên hiện lưu trong bộ nhớ nên bị xóa khi khởi động lại server.

## Phạm vi hiện tại

- Đơn đặt phòng ở trạng thái chờ cho đến khi quản trị viên xác nhận.
- Cả đơn chờ và đơn đã xác nhận đều giữ lịch phòng để tránh nhận đặt trùng.
- Hủy đơn sẽ giải phóng lịch. Khách sạn cần liên hệ khách để xác nhận yêu cầu.
- Ảnh phòng mẫu tải từ Unsplash; thay URL ảnh trong phần quản trị để dùng ảnh của khách sạn.
- Đây là MVP đơn máy, chưa tích hợp thanh toán, email/SMS, tài khoản khách hàng hoặc HTTPS. Không nên đưa trực tiếp lên Internet công khai nếu chưa triển khai HTTPS, sao lưu, quản lý bí mật và hardening phù hợp.
