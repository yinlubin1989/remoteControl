# ESP32-C3 + DumboRC X6F 蓝牙遥控桥

该固件读取小飞象 X6F 接收机的 `CH1/CH2 PWM`，并把 ESP32-C3 SuperMini 模拟为 Xbox One S BLE 手柄。iPhone 配对后，本项目网页继续通过 Gamepad API 和 Socket.IO 控制小车。

固件同时通过手柄 `axes[0]` 和 `axes[3]` 上报 `500–2500 μs` 的 CH1/CH2 原始脉宽；网页连接 `RC Car Controller` 后会显示并直接使用这两路 PWM 控车。网页按 `1500 μs` 为中位、`1000–2000 μs` 为全行程转换控制量，任一通道信号丢失时两路立即回中。

固件内部校准后的标准控制轴仍保留在 `axes[1]` 和 `axes[2]`，供其他 Gamepad API 使用方使用；本项目网页不依赖这两个轴的校准/回中解锁状态。

## 硬件

- ESP32-C3 SuperMini
- DumboRC X6/X6F 遥控器接收机套装
- 支持数据传输的 USB-C 线
- 杜邦线

购买前确认 X6F 实物明确标注支持 `3.3V` 供电。不要使用仅标注 `4.8–10V` 的旧版本。

## 接线

X6F 的每个通道都有 `S/+/-` 三个针脚，所有通道的电源针内部相通，只需连接一组电源。

| X6F | ESP32-C3 | 功能 |
| --- | --- | --- |
| 任意通道 `+` | `3.3V` | 接收机供电 |
| 任意通道 `-` | `GND` | 共地 |
| `CH1 S` | GPIO `0` | 方向 |
| `CH2 S` | GPIO `1` | 油门 |

不要把 X6F 接到 ESP32 的 `5V`。首次测试不要连接舵机、ESC 或小车。

## Arduino IDE 构建与烧录

1. 安装 `esp32 by Espressif Systems` 稳定版 `3.3.x`。
2. 库管理器安装 `NimBLE-Arduino` 和 Tom Stewart 的 `Callback`。
3. 下载并添加 `ESP32-BLE-CompositeHID` 固定版本 ZIP：
   `https://github.com/Mystfit/ESP32-BLE-CompositeHID/archive/06d93eab499181afaa3e26f96ecee67233c01303.zip`
4. 打开 `arduino/RC_Car_Controller/RC_Car_Controller.ino`。
5. 开发板选择 `ESP32C3 Dev Module`。
6. 设置 `USB CDC On Boot → Enabled`；有该选项时设置 `USB Mode → Hardware CDC and JTAG`。
7. 选择 `/dev/cu.usbmodem...` 串口并点击上传。
8. 上传失败时按住 `BOOT`，点按 `RST`，松开 `BOOT` 后重新上传。

串口监视器使用 `115200` 波特率。

## 首次校准

1. 打开小飞象 X6 遥控器，保持方向盘和油门扳机在中位。
2. 给 ESP32 和 X6F 上电。
3. 固件检测到 CH1/CH2 后，会采样中位 `2秒`。
4. 串口提示后，在 `8秒` 内把方向盘打满左右，并把油门扳机推到前进和倒车极限。
5. 校准成功后参数会保存，之后开机无需重复。
6. 每次启动或信号恢复后，方向和油门必须保持中位 `0.5秒` 才会解锁。

串口发送以下命令：

```text
CALIBRATE
STATUS
```

`CALIBRATE` 清除保存值并重新校准，`STATUS` 显示当前端点。

## 安全设置

- 在 X6 遥控器上把 CH1、CH2 失控保护设置为中位。
- 任一 PWM 通道超过 `100ms` 无有效信号时，ESP32 会输出手柄中位。
- 接收机与 ESP32 天线保持一定距离，硬件测试时确认两个 2.4GHz 链路不会相互干扰。

## PlatformIO

```sh
pio test -e native
pio run -e esp32c3_supermini
pio run -e esp32c3_supermini --target upload
pio device monitor --baud 115200
```
