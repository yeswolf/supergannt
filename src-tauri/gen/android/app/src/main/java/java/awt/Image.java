package java.awt;

import java.awt.image.ImageObserver;
import java.awt.image.ImageProducer;

/**
 * Minimal stub for JAXB/MPXJ on Android (no desktop AWT).
 * JAXB's RuntimeBuiltinLeafInfoImpl references {@code Image.class} at clinit.
 */
@SuppressWarnings("unused")
public abstract class Image implements java.io.Serializable {
  private static final long serialVersionUID = -8723122317599798214L;

  public static final int SCALE_DEFAULT = 1;
  public static final int SCALE_FAST = 2;
  public static final int SCALE_SMOOTH = 4;
  public static final int SCALE_REPLICATE = 8;
  public static final int SCALE_AREA_AVERAGING = 16;

  protected float accelerationPriority = 0.5f;

  public abstract int getWidth(ImageObserver observer);

  public abstract int getHeight(ImageObserver observer);

  public abstract ImageProducer getSource();

  public abstract Graphics getGraphics();

  public abstract Object getProperty(String name, ImageObserver observer);

  public Image getScaledInstance(int width, int height, int hints) {
    return null;
  }

  public void flush() {}

  public float getAccelerationPriority() {
    return accelerationPriority;
  }

  public void setAccelerationPriority(float priority) {
    accelerationPriority = priority;
  }
}
