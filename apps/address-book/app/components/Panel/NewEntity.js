import React from 'react'
import PropTypes from 'prop-types'
import { Form, FormField } from '../Form'
import { DropDown, TextInput } from '@aragon/ui'
import web3Utils from 'web3-utils'

const ENTITY_TYPES = [ 'Individual', 'Organization', 'Project' ]
const INITIAL_STATE = {
  name: '',
  address: '',
  type: 'Individual',
  error: {},
}

class NewEntity extends React.Component {
  static propTypes = {
    onCreateEntity: PropTypes.func.isRequired,
    addressList: PropTypes.arrayOf(PropTypes.string).isRequired,
  }

  state = INITIAL_STATE

  changeField = ({ target: { name, value } }) => {
    this.setState({
      [name]: value,
    })
  }

  changeType = type => {
    this.setState({
      type: ENTITY_TYPES[type],
    })
  }

  handleSubmit = () => {
    const { name, address, type } = this.state
    const error = {}
    if (!name) {
      error.name = 'Please provide a name'
    }
    if (!web3Utils.isAddress(address)) {
      error.address = 'Please provide a valid ethereum address'
    }
    if (this.props.addressList.includes(address)) {
      error.address = 'This address already exists in the address book'
    }

    if (Object.keys(error).length) {
      this.setState({ error: error })
    } else {
      this.setState(INITIAL_STATE)
      this.props.onCreateEntity({ name, address, type })
    }
  }

  render() {
    const { address, name, type, error } = this.state
    const { handleSubmit, changeField, changeType } = this
    return (
      <Form onSubmit={handleSubmit} submitText="Submit Entity">
        <FormField
          required
          label="Name"
          err={error && error.name}
          input={
            <TextInput name="name" onChange={changeField} value={name} wide />
          }
        />

        <FormField
          required
          label="Address"
          err={error && error.address}
          input={
            <TextInput
              name="address"
              onChange={changeField}
              value={address}
              wide
            />
          }
        />

        <FormField
          label="Type"
          input={
            <DropDown
              name="type"
              items={ENTITY_TYPES}
              onChange={changeType}
              selected={ENTITY_TYPES.indexOf(type)}
              wide
            />
          }
        />
      </Form>
    )
  }
}

export default NewEntity
