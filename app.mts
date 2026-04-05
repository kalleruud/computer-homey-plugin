import Homey from 'homey'

export default class ComputerApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  override async onInit() {
    this.log('Computer app has been initialized')
  }
}
