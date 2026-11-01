public class Aufwaermen {
  public int zaehle(int m) {
    int anzahl = 0;
    if (m > 0) {
      for (int k = 1; k <= m; k++) {
        anzahl = anzahl + 1;
      }
    } else {
      anzahl = -1;
    }
    return anzahl;
  }
}
