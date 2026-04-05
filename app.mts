import Homey from 'homey';

export default class MyApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  override async onInit() {
    this.log('MyApp has been initialized');
  }
}
