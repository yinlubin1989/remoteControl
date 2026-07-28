# ESP32-C3 双摇杆遥控器

该固件把 ESP32-C3 SuperMini 模拟为 Xbox One S BLE 手柄，供 iPhone 配对后由本项目网页读取。

## 接线

两个摇杆模块都必须使用开发板的 `3.3V` 供电，并与开发板共地。不要把摇杆输出接入 `5V`。

| 功能 | ESP32-C3 GPIO |
| --- | ---: |
| 左摇杆 VRx | 0 |
| 左摇杆 VRy | 1 |
| 右摇杆 VRx | 3 |
| 右摇杆 VRy | 4 |
| 左摇杆 SW | 5 |
| 右摇杆 SW | 6 |

左摇杆 Y 控制前进/倒车，右摇杆 X 控制方向。左摇杆按键切换舒适/运动模式，右摇杆按键触发急停。

## 构建与烧录

安装 PlatformIO Core 后，在本目录运行：

```sh
pio run
pio run --target upload
pio device monitor
```

每次上电后的前约 0.5 秒会校准中位。上电时保持两个摇杆静止在中心。

## iPhone 配对

1. 给遥控器上电，打开 iPhone 的“设置 → 蓝牙”。
2. 选择 `RC Car Controller` 完成配对。
3. 在 Safari 打开小车控制网页，并按一次任意摇杆按键激活浏览器的手柄输入。
4. 网页显示“手柄已连接”后再操作小车。

如果需要重新配对，先在 iPhone 蓝牙设置中忽略 `RC Car Controller`，重启遥控器后再次配对。

## 本地测试

```sh
pio test -e native
```
