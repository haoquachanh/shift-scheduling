# Giờ Làm – PWA tính giờ làm cá nhân (iOS)

Hoàn toàn miễn phí, không cần server, chạy offline.

| Tính năng | Cách làm |
|---|---|
| Lịch lưới vô hạn | Tab **Lịch** – vuốt ngang / ‹ › để đổi tháng, chạm ngày để nhập; điện thoại có nút đổi **Giờ trong ngày / Tổng 7 ngày**, màn hình lớn hiện cả 2 dòng |
| Nhập 2 ca + nghỉ giải lao | Bảng nhập có mẫu ca nhanh (tùy chỉnh sửa/thêm/xóa trực tiếp), kiểm tra luật ngay khi gõ |
| Luật 28h / 7 ngày liên tục | Kiểm tra mọi cửa sổ 7 ngày (rolling), kể cả xuyên tháng |
| Luật quá 7h liên tục → nghỉ 1h | Kiểm tra từng ngày, chỉ bắt buộc nghỉ khi làm quá 7h (gộp 2 ca nếu nghỉ giữa ca < 1h) |
| Giờ làm việc & thời gian bận | Tab **Cài đặt**: chọn khung giờ có thể đi làm theo thứ (mặc định 07:00–22:00) + thêm khung giờ bận lặp lại hằng tuần |
| Đa ngôn ngữ | Hỗ trợ **Tiếng Việt**, **English**, **日本語** |
| Hôm nay còn làm được bao nhiêu | Tab **Gợi ý**: theo luật / theo giờ rảnh thực tế / đề xuất tối ưu |
| Lịch kế hoạch + lịch rảnh sắp tới | Tab **Gợi ý** – bấm *Áp dụng* để điền vào lịch |
| Xuất PDF theo tháng | Tab **Bảng tháng** → *Xuất PDF* (tạo ngay trên máy, không cần mạng) |
| Offline + upload | localStorage + Service Worker; đồng bộ lên GitHub Gist bí mật khi có mạng, hoặc xuất/nhập file JSON |

## Triển khai miễn phí lên GitHub Pages (cần HTTPS để PWA chạy offline)

1. Tạo repo mới trên GitHub (vd `gio-lam`), upload toàn bộ thư mục này (có thể bỏ thư mục `test/`).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `root` → Save.
3. Sau ~1 phút mở `https://<tên-github>.github.io/gio-lam/` bằng **Safari** trên iPhone.
4. Bấm **Chia sẻ** → **Thêm vào MH chính**. Từ giờ mở app từ icon, dùng được cả khi không có mạng.

> Muốn link khó đoán hơn: dùng Netlify Drop (kéo thả thư mục lên app.netlify.com/drop) hoặc Cloudflare Pages – đều miễn phí.
> Dữ liệu nằm trên iPhone của anh, người khác mở link chỉ thấy app trống.

## Đồng bộ đám mây (tuỳ chọn)

1. github.com → Settings → Developer settings → **Fine-grained tokens** → Generate → Permissions: **Gists: Read and write**.
2. App → Cài đặt → dán token → *Đồng bộ ngay*. App tự tạo Gist **bí mật** và hiển thị Gist ID.
3. Máy khác: nhập cùng token + Gist ID. Dữ liệu gộp theo từng ngày (bản sửa mới nhất thắng).
4. Khi offline, thay đổi được đánh dấu ⏫ và tự tải lên lúc có mạng lại.

## Cập nhật code
Sửa xong, tăng `VERSION` trong `sw.js` để iPhone tải bản mới (mở app 2 lần là thấy).

## Thuật toán gợi ý (`js/planner.js`)
1. **Năng lực từng ngày**: giờ rảnh theo thứ − lịch bận − ca đã có → tìm tổ hợp ≤ 2 ca hợp lệ nhiều giờ nhất.
2. **Phân bổ theo luật 7 ngày cuốn chiếu** (tính cả quá khứ và lịch đã lên):
   - *Cân bằng đều*: mỗi bước cộng 30' cho ngày đang ít giờ nhất mà vẫn hợp lệ → giờ làm dàn đều.
   - *Làm sớm tối đa*: tham lam từ hôm nay.
3. **Xếp ca cụ thể**: ưu tiên khung giờ yêu thích, ít ca nhất, tự chèn nghỉ 1h nếu ca > 7h.

## Kiểm thử & chạy trên máy tính
```
node test/run.mjs                 # luật + thuật toán, dùng dữ liệu tháng 10 mẫu
node server.mjs                   # mở http://localhost:8765 (dùng /test/seed.html để nạp dữ liệu mẫu)
```
