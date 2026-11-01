public class Hund {

  private String name;

  public void schlafen(int stunden) {
    if (stunden > 8) {
      System.out.println("Der Hund hat zu lange geschlafen.");
    } else {
      System.out.println("Der Hund ist ausgeruht.");
    }
  }

  public void fressen(int schuesseln) {
    for (int i = 0; i < schuesseln; i++) {
      System.out.println("mampf");
    }
  }

  public void bellen() {
    System.out.println("Wuff!");
  }

  public void spielen(boolean hatBall) {
    if (hatBall) {
      System.out.println("Der Hund apportiert.");
    }
  }
}
