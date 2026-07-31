package java.awt;

/**
 * Minimal Graphics stub for {@link Image#getGraphics()} on Android.
 */
@SuppressWarnings("unused")
public abstract class Graphics {
  protected Graphics() {}

  public abstract void dispose();

  public void finalize() {
    dispose();
  }
}
